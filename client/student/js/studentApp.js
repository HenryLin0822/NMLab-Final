// Enhanced Student Application with Device Selection and Face Recognition Support
class StudentApp {
    constructor() {
        this.video = document.getElementById('studentVideo');
        this.startCameraBtn = document.getElementById('startCameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.switchCameraBtn = document.getElementById('switchCameraBtn');
        this.cameraStatus = document.getElementById('cameraStatus');
        this.videoOverlay = document.querySelector('.video-overlay');
        
        // Device selection elements
        this.deviceSelector = document.getElementById('cameraDeviceSelect');
        this.refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
        this.deviceInfo = document.getElementById('deviceInfo');
        
        this.mediaStream = null;
        this.isStreaming = false;
        this.streamingInterval = null;
        this.frameRate = 10; // frames per second
        
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        
        // Device management properties
        this.availableDevices = [];
        this.currentDeviceId = null;
        this.currentDeviceInfo = null;
        this.isDeviceSwitching = false;
        
        // Face recognition state
        this.faceRecognitionEnabled = false;
        this.isFaceRegistered = false;
        
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
        
        // Check for enhanced video support
        if (!support.fullVideoSupport) {
            Utils.showNotification('Limited camera support detected', 'warning');
            Utils.log('Device enumeration not supported, using basic camera access', 'warn');
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket
        window.studentWebSocket.connect();
        
        // Initialize device selection
        this.initializeDeviceSelection();
        
        // Update initial status
        Utils.updateStatus('cameraStatusText', 'Not started');
        Utils.updateStatus('streamingStatus', 'Not streaming');
        Utils.updateStatus('cameraSourceStatus', 'Not selected');
        Utils.updateStatus('identityStatus', 'Not verified');
        
        Utils.log('Student app initialized with device selection and face recognition support');
    }
    
    setupEventListeners() {
        // Camera control buttons
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        this.switchCameraBtn.addEventListener('click', () => this.switchToSelectedDevice());
        
        // Device selection listeners
        this.deviceSelector.addEventListener('change', () => this.onDeviceSelectionChanged());
        this.refreshDevicesBtn.addEventListener('click', () => this.refreshDeviceList());
        
        // Listen for student assignment
        document.addEventListener('studentAssigned', (event) => {
            Utils.log(`Student assigned: ${event.detail.name}`);
            
            // Store face recognition availability
            this.faceRecognitionEnabled = event.detail.faceRecognitionEnabled || false;
            Utils.log(`Face recognition: ${this.faceRecognitionEnabled ? 'Enabled' : 'Disabled'}`);
            
            this.updateCameraButtonStates();
        });
        
        // Listen for face registration completion
        document.addEventListener('faceRegistrationResult', (event) => {
            if (event.detail.success) {
                this.isFaceRegistered = true;
                this.updateCameraButtonStates();
                Utils.log('Face registration completed - camera can now be started');
            }
        });
        
        // Listen for face recognition service status
        document.addEventListener('faceRecognitionServiceStatus', (event) => {
            this.faceRecognitionEnabled = event.detail.enabled;
            this.updateCameraButtonStates();
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
    
    // Initialize device selection functionality
    async initializeDeviceSelection() {
        try {
            Utils.log('Initializing device selection...');
            
            // Populate device selector
            const success = await Utils.populateDeviceSelector('cameraDeviceSelect');
            
            if (success) {
                this.refreshDevicesBtn.disabled = false;
                Utils.log('Device selection initialized successfully');
                
                // Update device info if a device is pre-selected
                this.updateDeviceInfo();
            } else {
                Utils.log('Failed to initialize device selection', 'warn');
                this.handleDeviceSelectionError();
            }
            
        } catch (error) {
            Utils.log('Error initializing device selection: ' + error.message, 'error');
            this.handleDeviceSelectionError();
        }
    }
    
    // Handle device selection change
    onDeviceSelectionChanged() {
        const selectedDeviceInfo = Utils.getSelectedDeviceInfo('cameraDeviceSelect');
        
        if (selectedDeviceInfo) {
            this.currentDeviceInfo = selectedDeviceInfo;
            this.updateDeviceInfo();
            this.updateSwitchButton();
            
            Utils.log(`Device selected: ${selectedDeviceInfo.label} (${selectedDeviceInfo.isOBS ? 'OBS' : 'Standard'})`);
            
            // Show notification for OBS selection
            if (selectedDeviceInfo.isOBS) {
                Utils.showNotification('OBS Virtual Camera selected - Enhanced quality available', 'success');
            }
        }
    }
    
    // Refresh device list
    async refreshDeviceList() {
        try {
            this.refreshDevicesBtn.disabled = true;
            this.refreshDevicesBtn.textContent = '⟳';
            
            Utils.log('Refreshing device list...');
            
            const success = await Utils.populateDeviceSelector('cameraDeviceSelect');
            
            if (success) {
                Utils.showNotification('Device list refreshed', 'success');
                this.updateDeviceInfo();
            } else {
                Utils.showNotification('Failed to refresh device list', 'error');
            }
            
        } catch (error) {
            Utils.log('Error refreshing devices: ' + error.message, 'error');
            Utils.showNotification('Error refreshing devices', 'error');
        } finally {
            this.refreshDevicesBtn.disabled = false;
            this.refreshDevicesBtn.textContent = '🔄';
        }
    }
    
    // Update device information display
    updateDeviceInfo() {
        const selectedDeviceInfo = Utils.getSelectedDeviceInfo('cameraDeviceSelect');
        
        if (!selectedDeviceInfo || !this.deviceInfo) {
            return;
        }
        
        const deviceTypeIcon = this.deviceInfo.querySelector('.device-type-icon');
        const deviceName = this.deviceInfo.querySelector('.device-name');
        const deviceType = this.deviceInfo.querySelector('.device-type');
        
        if (deviceTypeIcon && deviceName && deviceType) {
            // Update icon and text based on device type
            if (selectedDeviceInfo.isOBS) {
                deviceTypeIcon.textContent = '📹';
                deviceName.textContent = selectedDeviceInfo.label.replace('📹 ', '').replace(' (OBS)', '');
                deviceType.textContent = 'OBS Virtual Camera';
                deviceType.className = 'device-type obs-type';
                this.deviceInfo.className = 'device-info obs-active';
                Utils.updateStatus('cameraSourceStatus', 'OBS Virtual Camera', 'obs-source');
            } else {
                deviceTypeIcon.textContent = '📷';
                deviceName.textContent = selectedDeviceInfo.label.replace('📷 ', '');
                deviceType.textContent = 'Standard Camera';
                deviceType.className = 'device-type';
                this.deviceInfo.className = 'device-info';
                Utils.updateStatus('cameraSourceStatus', 'Standard Webcam', 'standard-source');
            }
            
            // Show device info
            this.deviceInfo.classList.remove('hidden');
        }
    }
    
    // Update switch button state
    updateSwitchButton() {
        if (!this.switchCameraBtn) return;
        
        const hasSelectedDevice = !!Utils.getSelectedDeviceInfo('cameraDeviceSelect');
        const isDifferentDevice = this.currentDeviceId !== this.deviceSelector.value;
        
        // Enable switch button if camera is active and different device is selected
        this.switchCameraBtn.disabled = !(this.mediaStream && hasSelectedDevice && isDifferentDevice);
        
        // Update button text based on state
        if (this.isDeviceSwitching) {
            this.switchCameraBtn.textContent = 'Switching...';
        } else if (this.currentDeviceInfo?.isOBS) {
            this.switchCameraBtn.textContent = 'Switch to OBS';
        } else {
            this.switchCameraBtn.textContent = 'Switch Camera';
        }
    }
    
    // Update camera button states based on face registration requirements
    updateCameraButtonStates() {
        if (!this.faceRecognitionEnabled) {
            // Face recognition disabled - camera can be started normally
            this.startCameraBtn.disabled = !!this.mediaStream;
            return;
        }
        
        // Face recognition enabled - check registration status
        if (!this.isFaceRegistered) {
            // Face not registered - disable camera start
            this.startCameraBtn.disabled = true;
            this.startCameraBtn.textContent = 'Register Face First';
            this.startCameraBtn.title = 'Please complete face registration before starting camera';
        } else {
            // Face registered - enable camera start
            this.startCameraBtn.disabled = !!this.mediaStream;
            this.startCameraBtn.textContent = 'Start Camera';
            this.startCameraBtn.title = '';
        }
    }
    
    // Switch to selected device
    async switchToSelectedDevice() {
        if (this.isDeviceSwitching) {
            Utils.log('Device switch already in progress', 'warn');
            return;
        }
        
        const selectedDeviceInfo = Utils.getSelectedDeviceInfo('cameraDeviceSelect');
        if (!selectedDeviceInfo) {
            Utils.showNotification('Please select a camera device', 'warning');
            return;
        }
        
        if (selectedDeviceInfo.deviceId === this.currentDeviceId) {
            Utils.showNotification('Selected device is already active', 'info');
            return;
        }
        
        try {
            this.isDeviceSwitching = true;
            this.updateSwitchButton();
            
            Utils.log(`Switching to device: ${selectedDeviceInfo.label}`);
            Utils.showStatusMessage('statusMessage', `Switching to ${selectedDeviceInfo.label}...`, 'info');
            
            // Add switching animation
            this.video.parentElement.classList.add('switching');
            
            // Stop current stream
            if (this.mediaStream) {
                this.stopVideoStreaming();
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            
            // Start with new device
            await this.startCameraWithDevice(selectedDeviceInfo);
            
            Utils.hideStatusMessage('statusMessage');
            Utils.showNotification(`Switched to ${selectedDeviceInfo.label}`, 'success');
            
        } catch (error) {
            Utils.log('Error switching camera: ' + error.message, 'error');
            this.handleCameraError(error);
        } finally {
            this.isDeviceSwitching = false;
            this.updateSwitchButton();
            
            // Remove switching animation
            setTimeout(() => {
                this.video.parentElement.classList.remove('switching');
            }, 500);
        }
    }
    
    async startCamera() {
        // Check face registration requirements
        if (this.faceRecognitionEnabled && !this.isFaceRegistered) {
            Utils.showNotification('Please complete face registration first', 'warning');
            Utils.showStatusMessage('statusMessage', 'Face registration required before starting camera', 'warning');
            return;
        }
        
        const selectedDeviceInfo = Utils.getSelectedDeviceInfo('cameraDeviceSelect');
        
        if (selectedDeviceInfo) {
            await this.startCameraWithDevice(selectedDeviceInfo);
        } else {
            // Fallback to default camera
            await this.startCameraWithDevice({ deviceId: 'default', label: 'Default Camera', isOBS: false });
        }
    }
    
    // Enhanced camera start with device selection and face registration check
    async startCameraWithDevice(deviceInfo) {
        try {
            Utils.log(`Starting camera with device: ${deviceInfo.label}`);
            Utils.showStatusMessage('statusMessage', `Starting ${deviceInfo.label}...`, 'info');
            
            // Get appropriate constraints for the device
            const constraints = Utils.getConstraintsForDevice(deviceInfo.deviceId, deviceInfo);
            
            // Request camera access
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Set video source
            this.video.srcObject = this.mediaStream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.addEventListener('loadedmetadata', resolve, { once: true });
            });
            
            // Update current device tracking
            this.currentDeviceId = deviceInfo.deviceId;
            this.currentDeviceInfo = deviceInfo;
            
            // Update UI
            this.updateCameraUI(true);
            this.hideVideoOverlay();
            this.updateSwitchButton();
            
            // Start streaming
            this.startVideoStreaming();
            
            // Log device-specific information
            const videoTrack = this.mediaStream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            
            Utils.log(`Camera started: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
            Utils.log(`Device: ${deviceInfo.label} (${deviceInfo.isOBS ? 'OBS' : 'Standard'})`);
            
            Utils.hideStatusMessage('statusMessage');
            
            // Show success notification with device-specific message
            const successMessage = deviceInfo.isOBS 
                ? `OBS Virtual Camera started successfully (${settings.width}x${settings.height})`
                : `Camera started successfully (${settings.width}x${settings.height})`;
            
            Utils.showNotification(successMessage, 'success');
            
            // Update verification step if face recognition is enabled
            if (this.faceRecognitionEnabled && this.isFaceRegistered) {
                // Trigger step 2 completion
                const event = new CustomEvent('cameraStartedForVerification');
                document.dispatchEvent(event);
            }
            
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
        
        // Reset device tracking
        this.currentDeviceId = null;
        
        // Update UI
        this.updateCameraUI(false);
        this.showVideoOverlay();
        this.updateSwitchButton();
        
        Utils.updateStatus('cameraStatusText', 'Not started');
        Utils.updateStatus('cameraSourceStatus', 'Not selected');
        Utils.updateStatus('identityStatus', 'Not verified');
        Utils.showNotification('Camera stopped', 'info');
    }
    
    startVideoStreaming() {
        if (this.isStreaming) return;
        
        this.isStreaming = true;
        
        // Adjust frame rate for OBS (can handle higher rates)
        const frameRate = this.currentDeviceInfo?.isOBS ? 15 : 10;
        const interval = 1000 / frameRate;
        
        this.streamingInterval = setInterval(() => {
            this.captureAndSendFrame();
        }, interval);
        
        Utils.updateStatus('streamingStatus', 'Streaming');
        
        // Update status with device-specific info
        const statusText = this.currentDeviceInfo?.isOBS 
            ? 'Active - Streaming (OBS)'
            : 'Active - Streaming';
        Utils.updateStatus('cameraStatusText', statusText);
        
        // Dispatch camera status change event
        this.dispatchCameraStatusEvent(true);
        
        Utils.log(`Started video streaming at ${frameRate} FPS (${this.currentDeviceInfo?.isOBS ? 'OBS' : 'Standard'})`);
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
            
            // Use different quality settings for OBS vs standard cameras
            const quality = this.currentDeviceInfo?.isOBS ? 0.8 : 0.7;
            const maxSize = this.currentDeviceInfo?.isOBS ? 300 : 200; // KB
            
            // Convert to data URL with compression
            const frameData = Utils.canvasToDataURL(this.canvas, quality, maxSize);
            
            // Prepare frame data with device info
            const videoFrame = {
                dataUrl: frameData.dataUrl,
                width: this.canvas.width,
                height: this.canvas.height,
                sizeKB: frameData.sizeKB,
                quality: frameData.quality,
                timestamp: new Date().toISOString(),
                deviceType: this.currentDeviceInfo?.isOBS ? 'obs' : 'standard',
                deviceLabel: this.currentDeviceInfo?.label || 'Unknown'
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
            
            // Disable device selector when camera is active
            this.deviceSelector.disabled = true;
        } else {
            this.updateCameraButtonStates(); // Use the enhanced button state logic
            this.stopCameraBtn.disabled = true;
            this.cameraStatus.textContent = 'Camera Off';
            
            // Re-enable device selector when camera is off
            this.deviceSelector.disabled = false;
        }
        
        // Update switch button
        this.updateSwitchButton();
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
    
    // Handle device selection errors
    handleDeviceSelectionError() {
        this.deviceSelector.innerHTML = '<option value="">Device access failed</option>';
        this.deviceSelector.disabled = true;
        this.refreshDevicesBtn.disabled = true;
        
        Utils.showStatusMessage('statusMessage', 
            'Unable to access camera devices. Please check permissions and try refreshing.', 
            'warning');
    }
    
    handleCameraError(error) {
        let errorMessage = 'Failed to access camera';
        
        switch (error.name) {
            case 'NotAllowedError':
                errorMessage = 'Camera access denied. Please allow camera permissions and refresh the page.';
                break;
            case 'NotFoundError':
                errorMessage = 'Selected camera not found. It may have been disconnected.';
                // Re-populate device list in case device was disconnected
                this.refreshDeviceList();
                break;
            case 'NotSupportedError':
                errorMessage = 'Selected camera not supported in this browser.';
                break;
            case 'NotReadableError':
                errorMessage = 'Camera is already in use by another application.';
                break;
            case 'OverconstrainedError':
                errorMessage = 'Camera settings could not be satisfied. Try a different camera.';
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
            detail: { 
                isActive: isActive,
                deviceType: this.currentDeviceInfo?.isOBS ? 'obs' : 'standard',
                deviceLabel: this.currentDeviceInfo?.label,
                faceRecognitionEnabled: this.faceRecognitionEnabled,
                faceRegistered: this.isFaceRegistered
            }
        });
        document.dispatchEvent(event);
    }
    
    cleanup() {
        Utils.log('Cleaning up student app...');
        this.stopCamera();
        window.studentWebSocket.disconnect();
    }
    
    // Enhanced state information with device details and face recognition
    getState() {
        return {
            hasCamera: !!this.mediaStream,
            isStreaming: this.isStreaming,
            videoWidth: this.video.videoWidth || 0,
            videoHeight: this.video.videoHeight || 0,
            frameRate: this.frameRate,
            currentDeviceId: this.currentDeviceId,
            currentDeviceInfo: this.currentDeviceInfo,
            availableDevices: this.availableDevices.length,
            isDeviceSwitching: this.isDeviceSwitching,
            faceRecognitionEnabled: this.faceRecognitionEnabled,
            isFaceRegistered: this.isFaceRegistered
        };
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.studentApp = new StudentApp();
    Utils.log('Enhanced Student app loaded and initialized with device selection and face recognition');
});