// Main Student Application
class StudentApp {
    constructor() {
        this.video = document.getElementById('studentVideo');
        this.startCameraBtn = document.getElementById('startCameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.cameraStatus = document.getElementById('cameraStatus');
        this.videoOverlay = document.querySelector('.video-overlay');
        
        this.mediaStream = null;
        this.isStreaming = false;
        this.streamingInterval = null;
        this.frameRate = 10; // 2 frames per second
        
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        
        this.initialize();
    }
    
    initialize() {
        // Check browser support
        const support = Utils.checkBrowserSupport();
        if (!support.getUserMedia) {
            Utils.showNotification('Your browser does not support camera access', 'error');
            Utils.showStatusMessage('statusMessage', 'Browser not supported. Please use a modern browser.', 'error');
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket
        window.studentWebSocket.connect();
        
        // Update initial status
        Utils.updateStatus('cameraStatusText', 'Not started');
        Utils.updateStatus('streamingStatus', 'Not streaming');
        
        Utils.log('Student app initialized');
    }
    
    setupEventListeners() {
        // Camera control buttons
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        
        // Listen for student assignment
        document.addEventListener('studentAssigned', (event) => {
            Utils.log(`Student assigned: ${event.detail.name}`);
        });
        
        // Page visibility change (pause streaming when tab not visible)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isStreaming) {
                this.pauseStreaming();
            } else if (!document.hidden && this.mediaStream) {
                this.resumeStreaming();
            }
        });
        
        // Before page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    async startCamera() {
        try {
            Utils.log('Starting camera...');
            Utils.showStatusMessage('statusMessage', 'Starting camera...', 'info');
            
            // Get video constraints
            const constraints = Utils.getVideoConstraints();
            
            // Request camera access
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Set video source
            this.video.srcObject = this.mediaStream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.addEventListener('loadedmetadata', resolve, { once: true });
            });
            
            // Update UI
            this.updateCameraUI(true);
            this.hideVideoOverlay();
            
            // Start streaming
            this.startVideoStreaming();
            
            Utils.log(`Camera started: ${this.video.videoWidth}x${this.video.videoHeight}`);
            Utils.hideStatusMessage('statusMessage');
            Utils.showNotification('Camera started successfully', 'success');
            
        } catch (error) {
            Utils.log('Camera error: ' + error.message, 'error');
            this.handleCameraError(error);
        }
    }
    
    stopCamera() {
        Utils.log('Stopping camera...');
        
        // Stop streaming
        this.stopVideoStreaming();
        
        // Stop media tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => {
                track.stop();
            });
            this.mediaStream = null;
        }
        
        // Clear video source
        this.video.srcObject = null;
        
        // Update UI
        this.updateCameraUI(false);
        this.showVideoOverlay();
        
        Utils.updateStatus('cameraStatusText', 'Not started');
        Utils.showNotification('Camera stopped', 'info');
    }
    
    startVideoStreaming() {
        if (this.isStreaming) return;
        
        this.isStreaming = true;
        const interval = 1000 / this.frameRate; // Convert to milliseconds
        
        this.streamingInterval = setInterval(() => {
            this.captureAndSendFrame();
        }, interval);
        
        Utils.updateStatus('streamingStatus', 'Streaming');
        Utils.updateStatus('cameraStatusText', 'Active - Streaming');
        
        // Dispatch camera status change event
        this.dispatchCameraStatusEvent(true);
        
        Utils.log(`Started video streaming at ${this.frameRate} FPS`);
    }
    
    stopVideoStreaming() {
        if (!this.isStreaming) return;
        
        this.isStreaming = false;
        
        if (this.streamingInterval) {
            clearInterval(this.streamingInterval);
            this.streamingInterval = null;
        }
        
        Utils.updateStatus('streamingStatus', 'Not streaming');
        
        // Dispatch camera status change event
        this.dispatchCameraStatusEvent(false);
        
        Utils.log('Stopped video streaming');
    }
    
    pauseStreaming() {
        if (this.isStreaming) {
            this.stopVideoStreaming();
            Utils.log('Streaming paused (tab hidden)');
        }
    }
    
    resumeStreaming() {
        if (this.mediaStream && !this.isStreaming) {
            this.startVideoStreaming();
            Utils.log('Streaming resumed (tab visible)');
        }
    }
    
    captureAndSendFrame() {
        if (!this.mediaStream || !this.video.videoWidth || !this.video.videoHeight) {
            return;
        }
        
        try {
            // Set canvas size to video dimensions
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            // Draw current video frame to canvas
            this.context.drawImage(this.video, 0, 0);
            
            // Convert to data URL with compression
            const frameData = Utils.canvasToDataURL(this.canvas, 0.7, 200); // 200KB max
            
            // Prepare frame data
            const videoFrame = {
                dataUrl: frameData.dataUrl,
                width: this.canvas.width,
                height: this.canvas.height,
                sizeKB: frameData.sizeKB,
                quality: frameData.quality,
                timestamp: new Date().toISOString()
            };
            
            // Dispatch event for WebSocket to send
            this.dispatchVideoFrameEvent(videoFrame);
            
        } catch (error) {
            Utils.log('Error capturing frame: ' + error.message, 'error');
        }
    }
    
    updateCameraUI(isActive) {
        if (isActive) {
            this.startCameraBtn.disabled = true;
            this.stopCameraBtn.disabled = false;
            this.startCameraBtn.textContent = 'Camera Active';
            this.cameraStatus.textContent = 'Camera Active';
        } else {
            this.startCameraBtn.disabled = false;
            this.stopCameraBtn.disabled = true;
            this.startCameraBtn.textContent = 'Start Camera';
            this.cameraStatus.textContent = 'Camera Off';
        }
    }
    
    showVideoOverlay() {
        if (this.videoOverlay) {
            this.videoOverlay.classList.remove('hidden');
        }
    }
    
    hideVideoOverlay() {
        if (this.videoOverlay) {
            this.videoOverlay.classList.add('hidden');
        }
    }
    
    handleCameraError(error) {
        let errorMessage = 'Failed to access camera';
        
        switch (error.name) {
            case 'NotAllowedError':
                errorMessage = 'Camera access denied. Please allow camera permissions and refresh the page.';
                break;
            case 'NotFoundError':
                errorMessage = 'No camera found on this device.';
                break;
            case 'NotSupportedError':
                errorMessage = 'Camera not supported in this browser.';
                break;
            case 'NotReadableError':
                errorMessage = 'Camera is already in use by another application.';
                break;
            case 'OverconstrainedError':
                errorMessage = 'Camera constraints could not be satisfied.';
                break;
            default:
                errorMessage += ': ' + error.message;
        }
        
        Utils.showStatusMessage('statusMessage', errorMessage, 'error');
        Utils.showNotification(errorMessage, 'error');
        Utils.updateStatus('cameraStatusText', 'Error');
        
        this.updateCameraUI(false);
        this.showVideoOverlay();
    }
    
    dispatchVideoFrameEvent(frameData) {
        const event = new CustomEvent('videoFrameReady', {
            detail: frameData
        });
        document.dispatchEvent(event);
    }
    
    dispatchCameraStatusEvent(isActive) {
        const event = new CustomEvent('cameraStatusChanged', {
            detail: { isActive: isActive }
        });
        document.dispatchEvent(event);
    }
    
    cleanup() {
        Utils.log('Cleaning up student app...');
        this.stopCamera();
        window.studentWebSocket.disconnect();
    }
    
    // Get current state
    getState() {
        return {
            hasCamera: !!this.mediaStream,
            isStreaming: this.isStreaming,
            videoWidth: this.video.videoWidth || 0,
            videoHeight: this.video.videoHeight || 0,
            frameRate: this.frameRate
        };
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.studentApp = new StudentApp();
    Utils.log('Student app loaded and initialized');
});