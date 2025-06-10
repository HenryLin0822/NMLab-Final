// Student WebSocket Manager with Face Recognition Support
class StudentWebSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.studentInfo = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // Face recognition state
        this.faceRecognitionEnabled = false;
        
        this.setupEventHandlers();
    }
    
    connect() {
        try {
            Utils.log('Student attempting to connect to server...');
            Utils.updateStatus('connectionStatus', 'Connecting...', 'status-connecting');
            Utils.updateStatus('serverStatus', 'Connecting...');
            
            // Connect to student namespace
            this.socket = io('/student');
            this.setupSocketEventListeners();
            
        } catch (error) {
            Utils.log('Failed to connect to server: ' + error.message, 'error');
            Utils.updateStatus('connectionStatus', 'Connection Failed', 'status-disconnected');
            Utils.updateStatus('serverStatus', 'Failed');
            Utils.showNotification('Failed to connect to server', 'error');
        }
    }
    
    setupSocketEventListeners() {
        // Connection successful
        this.socket.on('connect', () => {
            Utils.log('Connected to server as student');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            Utils.updateStatus('connectionStatus', 'Connected', 'status-connected');
            Utils.updateStatus('serverStatus', 'Connected');
            Utils.showNotification('Connected to monitoring server', 'success');
            
            // Send device info
            this.socket.emit('deviceInfo', Utils.getDeviceInfo());
        });
        
        // Student ID assigned
        this.socket.on('studentAssigned', (data) => {
            this.studentInfo = data;
            Utils.log(`Assigned as ${data.name} (ID: ${data.studentId})`);
            
            // Store face recognition availability
            this.faceRecognitionEnabled = data.faceRecognitionEnabled || false;
            
            Utils.updateStatus('studentName', data.name);
            Utils.showNotification(`You are registered as ${data.name}`, 'success');
            
            // Dispatch face recognition service status
            if (this.faceRecognitionEnabled) {
                this.dispatchCustomEvent('faceRecognitionServiceStatus', {
                    enabled: true,
                    serviceUrl: data.faceRecognitionServiceUrl || 'Unknown'
                });
            }
            
            // Trigger custom event
            this.dispatchCustomEvent('studentAssigned', data);
        });
        
        // Face recognition status updates
        this.socket.on('faceRecognitionStatus', (data) => {
            this.faceRecognitionEnabled = data.enabled;
            Utils.log(`Face recognition service: ${data.enabled ? 'Enabled' : 'Disabled'}`);
            
            // Dispatch status to face registration manager
            this.dispatchCustomEvent('faceRecognitionServiceStatus', data);
        });
        
        // Face registration result
        this.socket.on('faceRegistrationResult', (data) => {
            Utils.log(`Face registration result: ${data.success ? 'Success' : 'Failed'}`);
            
            if (data.success) {
                Utils.log('Face registration completed successfully');
            } else {
                Utils.log('Face registration failed: ' + (data.error || 'Unknown error'), 'error');
            }
            
            // Dispatch to face registration manager
            this.dispatchCustomEvent('faceRegistrationResult', data);
        });
        
        // Real-time face verification updates (for display purposes)
        this.socket.on('faceVerificationUpdate', (data) => {
            Utils.log(`Face verification: ${data.verification} (confidence: ${data.confidence || 'N/A'})`);
            
            // Dispatch to face registration manager for UI updates
            this.dispatchCustomEvent('faceVerificationUpdate', data);
        });
        
        // Connection error
        this.socket.on('connect_error', (error) => {
            Utils.log('Connection error: ' + error.message, 'error');
            this.isConnected = false;
            
            Utils.updateStatus('connectionStatus', 'Connection Error', 'status-disconnected');
            Utils.updateStatus('serverStatus', 'Error');
            
            this.handleReconnect();
        });
        
        // Disconnected
        this.socket.on('disconnect', (reason) => {
            Utils.log('Disconnected from server: ' + reason, 'warn');
            this.isConnected = false;
            
            Utils.updateStatus('connectionStatus', 'Disconnected', 'status-disconnected');
            Utils.updateStatus('serverStatus', 'Disconnected');
            Utils.updateStatus('streamingStatus', 'Not streaming');
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                this.handleReconnect();
            }
        });
        
        // Server messages
        this.socket.on('serverMessage', (data) => {
            Utils.log('Server message: ' + data.message);
            Utils.showNotification(data.message, data.type || 'info');
        });
        
        // Error handling
        this.socket.on('error', (error) => {
            Utils.log('Socket error: ' + error.message, 'error');
            Utils.showNotification('Connection error occurred', 'error');
        });
    }
    
    setupEventHandlers() {
        // Listen for video frame events from camera
        document.addEventListener('videoFrameReady', (event) => {
            if (this.isConnected && this.socket) {
                this.sendVideoFrame(event.detail);
            }
        });
        
        // Listen for camera status changes
        document.addEventListener('cameraStatusChanged', (event) => {
            const status = event.detail.isActive ? 'Streaming' : 'Not streaming';
            Utils.updateStatus('streamingStatus', status);
        });
        
        // NEW: Listen for face registration requests
        document.addEventListener('registerFaceRequest', (event) => {
            if (this.isConnected && this.socket && this.faceRecognitionEnabled) {
                this.registerFace(event.detail);
            } else {
                Utils.log('Cannot register face: not connected or service disabled', 'error');
                this.dispatchCustomEvent('faceRegistrationResult', {
                    success: false,
                    error: 'Not connected to server or face recognition disabled'
                });
            }
        });
    }
    
    sendVideoFrame(frameData) {
        if (!this.isConnected || !this.socket) {
            return;
        }
        
        try {
            // Send frame data to server
            this.socket.emit('videoFrame', {
                dataUrl: frameData.dataUrl,
                width: frameData.width,
                height: frameData.height,
                sizeKB: frameData.sizeKB,
                timestamp: frameData.timestamp,
                quality: frameData.quality
            });
            
        } catch (error) {
            Utils.log('Error sending video frame: ' + error.message, 'error');
        }
    }
    
    // NEW: Send face registration request
    registerFace(registrationData) {
        if (!this.isConnected || !this.socket) {
            Utils.log('Cannot register face: not connected', 'error');
            return;
        }
        
        if (!this.faceRecognitionEnabled) {
            Utils.log('Cannot register face: service disabled', 'error');
            this.dispatchCustomEvent('faceRegistrationResult', {
                success: false,
                error: 'Face recognition service is disabled'
            });
            return;
        }
        
        try {
            Utils.log('Sending face registration request...');
            
            // Send registration data to server
            this.socket.emit('registerFace', {
                referenceImage: registrationData.referenceImage
            });
            
        } catch (error) {
            Utils.log('Error sending face registration: ' + error.message, 'error');
            this.dispatchCustomEvent('faceRegistrationResult', {
                success: false,
                error: 'Failed to send registration request'
            });
        }
    }
    
    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            Utils.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            Utils.updateStatus('connectionStatus', 'Reconnecting...', 'status-connecting');
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connect();
                }
            }, delay);
        } else {
            Utils.log('Max reconnection attempts reached', 'error');
            Utils.updateStatus('connectionStatus', 'Connection Lost', 'status-disconnected');
            Utils.showNotification('Connection lost. Please refresh the page.', 'error');
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        Utils.updateStatus('connectionStatus', 'Disconnected', 'status-disconnected');
    }
    
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            studentInfo: this.studentInfo,
            reconnectAttempts: this.reconnectAttempts,
            faceRecognitionEnabled: this.faceRecognitionEnabled
        };
    }
    
    // NEW: Get face recognition status
    getFaceRecognitionStatus() {
        return {
            enabled: this.faceRecognitionEnabled,
            connected: this.isConnected
        };
    }
    
    dispatchCustomEvent(eventName, data) {
        const event = new CustomEvent(eventName, {
            detail: data
        });
        document.dispatchEvent(event);
    }
}

// Create global instance
window.studentWebSocket = new StudentWebSocket();