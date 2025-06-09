// Enhanced Shared Utilities for Exam Monitoring System with OBS Support

class Utils {
    // Show notification to user
    static showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Hide notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
    
    // Update element text and class
    static updateStatus(elementId, text, className = '') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
            if (className) {
                element.className = className;
            }
        }
    }
    
    // Show/hide status message
    static showStatusMessage(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `status-message ${type} show`;
            element.style.display = 'block';
        }
    }
    
    // Hide status message
    static hideStatusMessage(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('show');
            setTimeout(() => {
                element.style.display = 'none';
            }, 300);
        }
    }
    
    // Format timestamp
    static formatTime(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        return date.toLocaleTimeString();
    }
    
    // Format file size
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Calculate image size from data URL
    static getImageSizeKB(dataUrl) {
        return Math.round(dataUrl.length * 0.75 / 1024);
    }
    
    // NEW: Enumerate available video devices
    static async enumerateVideoDevices() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                throw new Error('Device enumeration not supported');
            }
            
            // Request permission first to get device labels
            await navigator.mediaDevices.getUserMedia({ video: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            // Enhanced device information with OBS detection
            return videoDevices.map(device => ({
                deviceId: device.deviceId,
                label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
                isOBS: Utils.isOBSDevice(device.label),
                isDefault: device.deviceId === 'default'
            }));
            
        } catch (error) {
            Utils.log('Error enumerating video devices: ' + error.message, 'error');
            return [];
        }
    }
    
    // NEW: Detect if a device is OBS Virtual Camera
    static isOBSDevice(deviceLabel) {
        if (!deviceLabel) return false;
        
        const obsPatterns = [
            /obs virtual camera/i,
            /obs-camera/i,
            /obs studio/i,
            /virtual camera/i,
            /streamlabs/i
        ];
        
        return obsPatterns.some(pattern => pattern.test(deviceLabel));
    }
    
    // NEW: Get video constraints with device selection support
    static getVideoConstraints(deviceId = null) {
        const baseConstraints = {
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 15, max: 30 },
                facingMode: 'user'
            },
            audio: false
        };
        
        // If specific device ID is provided, use it
        if (deviceId && deviceId !== 'default') {
            baseConstraints.video.deviceId = { exact: deviceId };
            // Remove facingMode when using specific device
            delete baseConstraints.video.facingMode;
        }
        
        return baseConstraints;
    }
    
    // NEW: Get optimized constraints for OBS
    static getOBSVideoConstraints(deviceId) {
        return {
            video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 }
                // Note: No facingMode for OBS as it's not applicable
            },
            audio: false
        };
    }
    
    // NEW: Get appropriate constraints based on device type
    static getConstraintsForDevice(deviceId, deviceInfo) {
        if (!deviceInfo) {
            return Utils.getVideoConstraints(deviceId);
        }
        
        if (deviceInfo.isOBS) {
            Utils.log('Using OBS-optimized constraints for device: ' + deviceInfo.label);
            return Utils.getOBSVideoConstraints(deviceId);
        } else {
            Utils.log('Using standard constraints for device: ' + deviceInfo.label);
            return Utils.getVideoConstraints(deviceId);
        }
    }
    
    // NEW: Populate device selector dropdown
    static async populateDeviceSelector(selectElementId) {
        const selectElement = document.getElementById(selectElementId);
        if (!selectElement) {
            Utils.log('Device selector element not found: ' + selectElementId, 'error');
            return false;
        }
        
        try {
            // Clear existing options
            selectElement.innerHTML = '<option value="">Loading devices...</option>';
            selectElement.disabled = true;
            
            const devices = await Utils.enumerateVideoDevices();
            
            // Clear loading option
            selectElement.innerHTML = '';
            
            if (devices.length === 0) {
                selectElement.innerHTML = '<option value="">No cameras found</option>';
                return false;
            }
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.textContent = 'Default Camera';
            selectElement.appendChild(defaultOption);
            
            // Add device options
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                
                // Enhanced label with device type indication
                let displayLabel = device.label;
                if (device.isOBS) {
                    displayLabel = `📹 ${device.label} (OBS)`;
                } else {
                    displayLabel = `📷 ${device.label}`;
                }
                
                option.textContent = displayLabel;
                option.dataset.isObs = device.isOBS;
                selectElement.appendChild(option);
            });
            
            selectElement.disabled = false;
            
            // Auto-select OBS if available and show notification
            const obsDevice = devices.find(device => device.isOBS);
            if (obsDevice) {
                selectElement.value = obsDevice.deviceId;
                Utils.showNotification('OBS Virtual Camera detected and selected', 'success');
                Utils.log('OBS Virtual Camera auto-selected: ' + obsDevice.label);
            }
            
            return true;
            
        } catch (error) {
            Utils.log('Error populating device selector: ' + error.message, 'error');
            selectElement.innerHTML = '<option value="">Error loading devices</option>';
            selectElement.disabled = true;
            return false;
        }
    }
    
    // NEW: Get selected device info from selector
    static getSelectedDeviceInfo(selectElementId) {
        const selectElement = document.getElementById(selectElementId);
        if (!selectElement || !selectElement.value) {
            return null;
        }
        
        const selectedOption = selectElement.selectedOptions[0];
        if (!selectedOption) {
            return null;
        }
        
        return {
            deviceId: selectElement.value,
            label: selectedOption.textContent,
            isOBS: selectedOption.dataset.isObs === 'true',
            isDefault: selectElement.value === 'default'
        };
    }
    
    // Enhanced browser support check with device enumeration
    static checkBrowserSupport() {
        const support = {
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
            webSocket: 'WebSocket' in window,
            canvas: !!document.createElement('canvas').getContext
        };
        
        // Enhanced compatibility check
        support.fullVideoSupport = support.getUserMedia && support.enumerateDevices;
        
        return support;
    }
    
    // Get device info
    static getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine
        };
    }
    
    // Debounce function
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Throttle function
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Convert canvas to data URL with quality control
    static canvasToDataURL(canvas, quality = 0.8, maxSizeKB = 500) {
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let currentQuality = quality;
        
        // Reduce quality if image is too large
        while (Utils.getImageSizeKB(dataUrl) > maxSizeKB && currentQuality > 0.1) {
            currentQuality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        }
        
        return {
            dataUrl: dataUrl,
            quality: currentQuality,
            sizeKB: Utils.getImageSizeKB(dataUrl)
        };
    }
    
    // Log with timestamp
    static log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        
        switch (type) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            default:
                console.log(logMessage);
        }
    }
}

// Make Utils available globally
window.Utils = Utils;