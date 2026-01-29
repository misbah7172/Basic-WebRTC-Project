import { useState, useRef, useEffect } from 'react'
import './App.css'

const WS_URL = import.meta.env.PROD 
  ? `wss://${window.location.host}`
  : 'ws://localhost:8080'

function App() {
  const [mode, setMode] = useState(null) // null, 'stream', or 'view'
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('Ready')
  
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const wsRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const modeRef = useRef(null) // Track mode in ref for message handler

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Free TURN servers (limited, may be slow)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
  }

  // Effect to play local video when stream is available
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current && mode === 'stream') {
      console.log('Setting local video srcObject in useEffect')
      localVideoRef.current.srcObject = localStreamRef.current
      localVideoRef.current.play()
        .then(() => console.log('Local video playing'))
        .catch(e => console.error('Error playing local video:', e))
    }
  }, [mode, localStreamRef.current])

  // Effect to play remote video when stream is available
  useEffect(() => {
    if (remoteVideoRef.current && mode === 'view') {
      console.log('Remote video ref ready')
    }
  }, [mode])

  useEffect(() => {
    // Connect to signaling server with retry
    let reconnectTimeout
    
    const connectWebSocket = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setStatus('Connected to server')
        console.log('WebSocket connected')
      }

      ws.onclose = () => {
        setIsConnected(false)
        setStatus('Disconnected from server')
        console.log('WebSocket disconnected, retrying in 3s...')
        // Attempt to reconnect after 3 seconds
        reconnectTimeout = setTimeout(connectWebSocket, 3000)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setStatus('Connection error - Retrying...')
      }

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data)
        console.log('Received message:', message.type)
        
        switch (message.type) {
          case 'offer':
            console.log('Received offer from streamer')
            await handleOffer(message.offer)
            break
          case 'answer':
            console.log('Received answer from viewer')
            await handleAnswer(message.answer)
            break
          case 'ice-candidate':
            console.log('Received ICE candidate')
            await handleIceCandidate(message.candidate)
            break
          case 'streamer-available':
            console.log('Streamer is available')
            setStatus('Streamer is available - Waiting for offer')
            break
          case 'request-offer':
            console.log('Request to create offer received, mode:', modeRef.current)
            // Streamer should create offer for viewer
            if (modeRef.current === 'stream' && localStreamRef.current) {
              console.log('Creating offer for viewer')
              await createStreamerOffer()
            } else {
              console.log('Cannot create offer - not streaming or no stream available')
            }
            break
          case 'streamer-unavailable':
            console.log('Streamer unavailable')
            setStatus('No streamer available')
            break
        }
      }
    }

    connectWebSocket()

    return () => {
      clearTimeout(reconnectTimeout)
      cleanup()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration)
    peerConnectionRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate:', event.candidate.type)
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate
        }))
      } else {
        console.log('All ICE candidates have been sent')
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track)
      console.log('Remote streams:', event.streams)
      if (remoteVideoRef.current && event.streams[0]) {
        console.log('Setting remote video srcObject')
        remoteVideoRef.current.srcObject = event.streams[0]
        remoteVideoRef.current.play()
          .then(() => {
            console.log('Remote video playing')
            setStatus('Receiving stream')
          })
          .catch(e => console.error('Error playing remote video:', e))
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      setStatus(`ICE: ${pc.iceConnectionState}`)
    }

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setStatus('Connected ✓')
      } else if (pc.connectionState === 'disconnected') {
        setStatus('Disconnected')
      } else if (pc.connectionState === 'failed') {
        setStatus('Connection Failed - Retrying...')
        // Try ICE restart
        if (modeRef.current === 'stream') {
          console.log('Connection failed, attempting ICE restart')
        }
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState)
    }

    return pc
  }

  const startStreaming = async () => {
    try {
      setStatus('Starting camera...')
      console.log('Requesting camera access...')
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      })

      console.log('Camera access granted', stream)
      console.log('Video tracks:', stream.getVideoTracks())
      console.log('Audio tracks:', stream.getAudioTracks())

      localStreamRef.current = stream
      if (localVideoRef.current) {
        console.log('Setting video srcObject')
        localVideoRef.current.srcObject = stream
        // Force video to play
        try {
          await localVideoRef.current.play()
          console.log('Video playing successfully')
        } catch (e) {
          console.error('Play error:', e)
        }
      }

      setMode('stream')
      modeRef.current = 'stream'
      console.log('Mode set to stream')
      setStatus('Camera ready - Waiting for viewers')

      // Notify server that streamer is ready (if connected)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'streamer-ready'
        }))

        // Create peer connection
        const pc = createPeerConnection()
        
        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
          console.log('Adding track to peer connection:', track)
          pc.addTrack(track, stream)
        })
      } else {
        setStatus('Camera ready - Server disconnected')
      }

    } catch (error) {
      console.error('Error starting stream:', error)
      setStatus('Error: ' + error.message)
    }
  }

  const startViewing = async () => {
    try {
      setMode('view')
      modeRef.current = 'view'
      console.log('Mode set to view')
      setStatus('Connecting to streamer...')

      // Create peer connection first
      createPeerConnection()

      // Request to view stream
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'viewer-ready'
        }))
        console.log('Sent viewer-ready message')
      }

    } catch (error) {
      console.error('Error starting view:', error)
      setStatus('Error: Could not connect')
    }
  }

  const createStreamerOffer = async () => {
    try {
      if (!peerConnectionRef.current) {
        console.log('No peer connection available')
        return
      }
      
      console.log('Creating offer from streamer')
      const offer = await peerConnectionRef.current.createOffer()
      await peerConnectionRef.current.setLocalDescription(offer)
      
      wsRef.current.send(JSON.stringify({
        type: 'offer',
        offer: offer
      }))
      
      console.log('Offer sent to viewer')
      setStatus('Camera ready - Connected to viewer')
    } catch (error) {
      console.error('Error creating offer:', error)
    }
  }

  const handleOffer = async (offer) => {
    try {
      console.log('Handling offer, creating/getting peer connection')
      const pc = peerConnectionRef.current || createPeerConnection()
      
      console.log('Setting remote description (offer)')
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      
      console.log('Creating answer')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      console.log('Sending answer to streamer')
      wsRef.current.send(JSON.stringify({
        type: 'answer',
        answer: answer
      }))
      
      setStatus('Answer sent - Connecting...')
    } catch (error) {
      console.error('Error handling offer:', error)
      setStatus('Error: ' + error.message)
    }
  }

  const handleAnswer = async (answer) => {
    try {
      console.log('Received answer, setting remote description')
      if (!peerConnectionRef.current) {
        console.error('No peer connection available!')
        return
      }
      
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      )
      console.log('Remote description set successfully')
      setStatus('Answer received - Connecting...')
    } catch (error) {
      console.error('Error handling answer:', error)
      setStatus('Error: ' + error.message)
    }
  }

  const handleIceCandidate = async (candidate) => {
    try {
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        console.log('Adding ICE candidate:', candidate.candidate?.substring(0, 50) + '...')
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        )
      } else {
        console.log('Skipping ICE candidate (no remote description yet)')
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
    setMode(null)
    modeRef.current = null
    setStatus('Ready')
  }

  const handleStop = () => {
    cleanup()
    wsRef.current.send(JSON.stringify({
      type: 'disconnect'
    }))
  }

  return (
    <div className="app">
      <div className="container">
        <h1>🎥 Remote Camera</h1>
        
        <div className="status-bar">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">{status}</span>
        </div>

        {!mode && (
          <div className="button-container">
            <button 
              className="btn btn-stream"
              onClick={startStreaming}
              disabled={!isConnected}
            >
              📹 Stream
            </button>
            <button 
              className="btn btn-view"
              onClick={startViewing}
              disabled={!isConnected}
            >
              👁️ View
            </button>
          </div>
        )}

        {mode === 'stream' && (
          <div className="video-container">
            <h2>Your Stream</h2>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video-player"
            />
            <button className="btn btn-stop" onClick={handleStop}>
              ⏹️ Stop Streaming
            </button>
          </div>
        )}

        {mode === 'view' && (
          <div className="video-container">
            <h2>Remote Stream</h2>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="video-player"
            />
            <button className="btn btn-stop" onClick={handleStop}>
              ⏹️ Stop Viewing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
