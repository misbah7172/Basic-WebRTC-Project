# Deployment Guide for Render

## Prerequisites
- GitHub account
- Render account (free tier available at https://render.com)

## Deployment Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy on Render

#### Option A: Using Blueprint (Recommended)
1. Go to https://render.com/dashboard
2. Click "New" → "Blueprint"
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml` and configure the service

#### Option B: Manual Setup
1. Go to https://render.com/dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: remote-camera
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `NODE_ENV`: `production`

### 3. Important Settings

**WebSocket Support**: Render automatically supports WebSockets on the same port as HTTP.

**HTTPS/WSS**: Render provides automatic HTTPS, and the app will use WSS (secure WebSocket) in production.

### 4. Access Your App

After deployment completes, Render will provide a URL like:
`https://remote-camera-xxxx.onrender.com`

Your app will be accessible at this URL!

## Environment Variables

The app automatically configures itself based on the environment:
- **Development**: Uses `ws://localhost:8080`
- **Production**: Uses `wss://your-app-name.onrender.com`

## Troubleshooting

### WebSocket Connection Issues
- Ensure your Render service is on a paid plan if free tier doesn't work
- Check that the service is using the correct port (Render sets PORT automatically)

### Camera Access
- HTTPS is required for camera access in production (Render provides this automatically)
- Users must grant camera permissions in their browser

### Free Tier Limitations
- Free tier services spin down after 15 minutes of inactivity
- First request after spin down may take 30-60 seconds

## Testing Locally Before Deploy

```bash
# Build the production version
npm run build

# Test production build locally
NODE_ENV=production npm start
```

Then visit `http://localhost:8080` to test.
