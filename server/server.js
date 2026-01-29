import express from 'express'
import { WebSocketServer } from 'ws'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// Serve static files from dist folder in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

let streamer = null
const viewers = new Set()

wss.on('connection', (ws) => {
  console.log('New client connected')

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data)
      
      switch (message.type) {
        case 'streamer-ready':
          streamer = ws
          ws.role = 'streamer'
          console.log('Streamer is ready')
          
          // Notify all viewers that streamer is available
          viewers.forEach(viewer => {
            viewer.send(JSON.stringify({
              type: 'streamer-available'
            }))
          })
          break

        case 'viewer-ready':
          ws.role = 'viewer'
          viewers.add(ws)
          console.log('Viewer connected, total viewers:', viewers.size)
          
          if (streamer && streamer.readyState === 1) {
            // Tell streamer to create offer for this viewer
            streamer.send(JSON.stringify({
              type: 'request-offer'
            }))
            console.log('Requested offer from streamer')
          } else {
            ws.send(JSON.stringify({
              type: 'streamer-unavailable'
            }))
          }
          break

        case 'offer':
          // Forward offer from streamer to viewers
          console.log('Forwarding offer from streamer to viewers')
          viewers.forEach(viewer => {
            if (viewer.readyState === 1) {
              viewer.send(JSON.stringify({
                type: 'offer',
                offer: message.offer
              }))
            }
          })
          break

        case 'answer':
          // Forward answer from viewer to streamer
          console.log('Forwarding answer from viewer to streamer')
          if (streamer && streamer.readyState === 1) {
            streamer.send(JSON.stringify({
              type: 'answer',
              answer: message.answer
            }))
          }
          break

        case 'ice-candidate':
          // Forward ICE candidates
          if (ws.role === 'streamer') {
            viewers.forEach(viewer => {
              viewer.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: message.candidate
              }))
            })
          } else if (ws.role === 'viewer') {
            if (streamer) {
              streamer.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: message.candidate
              }))
            }
          }
          break

        case 'disconnect':
          handleDisconnect(ws)
          break
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  ws.on('close', () => {
    console.log('Client disconnected')
    handleDisconnect(ws)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
})

async function createOffer(viewer, streamer) {
  // Instruct viewer to create and send offer
  viewer.send(JSON.stringify({
    type: 'create-offer'
  }))
}

function handleDisconnect(ws) {
  if (ws === streamer) {
    console.log('Streamer disconnected')
    streamer = null
    
    // Notify all viewers
    viewers.forEach(viewer => {
      viewer.send(JSON.stringify({
        type: 'streamer-unavailable'
      }))
    })
  } else if (viewers.has(ws)) {
    viewers.delete(ws)
    console.log('Viewer disconnected, remaining viewers:', viewers.size)
  }
}

const PORT = process.env.PORT || 8080

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Signaling server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
