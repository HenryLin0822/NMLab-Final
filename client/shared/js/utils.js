// Shared Utilities for Exam Monitoring System

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
    
    // Validate video constraints
    static getVideoConstraints() {
        return {
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 15, max: 30 },
                facingMode: 'user'
            },
            audio: false
        };
    }
    
    // Check if device supports required features
    static checkBrowserSupport() {
        const support = {
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webSocket: 'WebSocket' in window,
            canvas: !!document.createElement('canvas').getContext
        };
        
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