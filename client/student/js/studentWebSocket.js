// Student WebSocket Manager
class StudentWebSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.studentInfo = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
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
            
            Utils.updateStatus('studentName', data.name);
            Utils.showNotification(`You are registered as ${data.name}`, 'success');
            
            // Trigger custom event
            this.dispatchCustomEvent('studentAssigned', data);
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
            reconnectAttempts: this.reconnectAttempts
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