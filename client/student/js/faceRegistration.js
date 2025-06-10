// Face Registration Manager for Student Interface
class FaceRegistration {
    constructor() {
        this.uploadArea = document.getElementById('uploadArea');
        this.faceImageInput = document.getElementById('faceImageInput');
        this.previewContainer = document.getElementById('previewContainer');
        this.previewImage = document.getElementById('previewImage');
        this.removeImageBtn = document.getElementById('removeImageBtn');
        this.registerFaceBtn = document.getElementById('registerFaceBtn');
        this.retakePhotoBtn = document.getElementById('retakePhotoBtn');
        this.registrationStatus = document.getElementById('registrationStatus');
        this.faceRegistrationSection = document.getElementById('faceRegistrationSection');
        this.faceRegistrationBadge = document.getElementById('faceRegistrationBadge');
        this.verificationCard = document.getElementById('verificationCard');
        this.verificationOverlay = document.getElementById('verificationOverlay');
        
        this.selectedFile = null;
        this.isRegistered = false;
        this.faceRecognitionEnabled = false;
        this.currentImageDataUrl = null;
        
        this.initialize();
    }
    
    initialize() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateUI();
        
        // Listen for face recognition service status
        document.addEventListener('faceRecognitionServiceStatus', (event) => {
            this.handleServiceStatus(event.detail);
        });
        
        // Listen for registration results
        document.addEventListener('faceRegistrationResult', (event) => {
            this.handleRegistrationResult(event.detail);
        });
        
        // Listen for real-time verification updates
        document.addEventListener('faceVerificationUpdate', (event) => {
            this.handleVerificationUpdate(event.detail);
        });
        
        Utils.log('Face registration manager initialized');
    }
    
    setupEventListeners() {
        // File input change
        this.faceImageInput.addEventListener('change', (event) => {
            this.handleFileSelect(event.target.files[0]);
        });
        
        // Upload area click
        this.uploadArea.addEventListener('click', () => {
            this.faceImageInput.click();
        });
        
        // Remove image button
        this.removeImageBtn.addEventListener('click', () => {
            this.clearSelection();
        });
        
        // Register face button
        this.registerFaceBtn.addEventListener('click', () => {
            this.registerFace();
        });
        
        // Retake photo button
        this.retakePhotoBtn.addEventListener('click', () => {
            this.clearSelection();
        });
    }
    
    setupDragAndDrop() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight drop area when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.add('drag-highlight');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.remove('drag-highlight');
            }, false);
        });
        
        // Handle dropped files
        this.uploadArea.addEventListener('drop', (event) => {
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        }, false);
    }
    
    preventDefaults(event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    handleFileSelect(file) {
        if (!file) return;
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showStatus('Please select an image file (JPG, PNG, WebP)', 'error');
            return;
        }
        
        // Validate file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            this.showStatus('Image file is too large. Please choose a file under 5MB.', 'error');
            return;
        }
        
        this.selectedFile = file;
        this.loadImagePreview(file);
    }
    
    loadImagePreview(file) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            this.currentImageDataUrl = event.target.result;
            this.previewImage.src = this.currentImageDataUrl;
            this.showPreview();
            this.showStatus('Image loaded. Click "Register Face" to complete registration.', 'info');
        };
        
        reader.onerror = () => {
            this.showStatus('Error loading image. Please try again.', 'error');
        };
        
        reader.readAsDataURL(file);
    }
    
    showPreview() {
        this.uploadArea.classList.add('hidden');
        this.previewContainer.classList.remove('hidden');
        this.registerFaceBtn.disabled = false;
    }
    
    hidePreview() {
        this.uploadArea.classList.remove('hidden');
        this.previewContainer.classList.add('hidden');
        this.registerFaceBtn.disabled = true;
    }
    
    clearSelection() {
        this.selectedFile = null;
        this.currentImageDataUrl = null;
        this.previewImage.src = '';
        this.faceImageInput.value = '';
        this.hidePreview();
        this.showStatus('', '');
    }
    
    async registerFace() {
        if (!this.currentImageDataUrl) {
            this.showStatus('Please select an image first.', 'error');
            return;
        }
        
        if (!this.faceRecognitionEnabled) {
            this.showStatus('Face recognition service is not available.', 'error');
            return;
        }
        
        try {
            this.registerFaceBtn.disabled = true;
            this.registerFaceBtn.textContent = 'Registering...';
            this.showStatus('Uploading and processing your photo...', 'info');
            
            // Send registration request via WebSocket
            const registrationData = {
                referenceImage: this.currentImageDataUrl
            };
            
            // Dispatch event for WebSocket to handle
            const event = new CustomEvent('registerFaceRequest', {
                detail: registrationData
            });
            document.dispatchEvent(event);
            
        } catch (error) {
            Utils.log('Registration error: ' + error.message, 'error');
            this.showStatus('Registration failed. Please try again.', 'error');
            this.resetRegisterButton();
        }
    }
    
    handleServiceStatus(status) {
        this.faceRecognitionEnabled = status.enabled;
        
        if (!status.enabled) {
            this.hideFaceRegistration();
            this.showStatus('Face recognition is currently disabled.', 'warning');
        } else {
            this.showFaceRegistration();
        }
        
        this.updateUI();
    }
    
    handleRegistrationResult(result) {
        this.resetRegisterButton();
        
        if (result.success) {
            this.isRegistered = true;
            this.showStatus('✅ Face registration successful! You can now start the camera.', 'success');
            this.hideFaceRegistration();
            this.updateVerificationSteps(1, 'completed');
            this.updateVerificationSteps(2, 'active');
            
            // Update badge
            this.updateRegistrationBadge(true);
            
            // Show success notification
            Utils.showNotification('Face registration completed successfully', 'success');
            
        } else {
            this.showStatus(`❌ Registration failed: ${result.error}`, 'error');
            Utils.showNotification('Face registration failed: ' + result.error, 'error');
        }
        
        this.updateUI();
    }
    
    handleVerificationUpdate(data) {
        if (!this.isRegistered) return;
        
        const verificationStatus = document.getElementById('verificationStatus');
        const identityStatus = document.getElementById('identityStatus');
        const verificationOverlay = document.getElementById('verificationOverlay');
        
        if (data.verification === 'match') {
            // Identity verified
            verificationStatus.innerHTML = `
                <span class="verification-icon">✅</span>
                <span class="verification-text">Identity Verified</span>
            `;
            verificationStatus.className = 'verification-status verified';
            identityStatus.textContent = 'Verified';
            identityStatus.className = 'status-verified';
            
            this.updateVerificationSteps(3, 'completed');
            
            // Show overlay briefly
            verificationOverlay.classList.remove('hidden');
            setTimeout(() => {
                verificationOverlay.classList.add('hidden');
            }, 3000);
            
        } else if (data.verification === 'no_match') {
            // Identity not verified
            verificationStatus.innerHTML = `
                <span class="verification-icon">❌</span>
                <span class="verification-text">Identity Mismatch</span>
            `;
            verificationStatus.className = 'verification-status mismatch';
            identityStatus.textContent = 'Mismatch Detected';
            identityStatus.className = 'status-error';
            
            this.updateVerificationSteps(3, 'error');
            
            // Show overlay with warning
            verificationOverlay.classList.remove('hidden');
            setTimeout(() => {
                verificationOverlay.classList.add('hidden');
            }, 5000);
            
        } else if (data.verification === 'no_face') {
            // No face detected
            verificationStatus.innerHTML = `
                <span class="verification-icon">👤</span>
                <span class="verification-text">No Face Detected</span>
            `;
            verificationStatus.className = 'verification-status no-face';
            identityStatus.textContent = 'Face Not Visible';
            identityStatus.className = 'status-warning';
            
            this.updateVerificationSteps(3, 'warning');
        }
    }
    
    updateVerificationSteps(stepNumber, status) {
        const step = document.getElementById(`step${stepNumber}`);
        const stepStatus = document.getElementById(`step${stepNumber}Status`);
        
        if (!step || !stepStatus) return;
        
        // Remove existing status classes
        step.classList.remove('completed', 'active', 'error', 'warning');
        
        // Add new status class
        step.classList.add(status);
        
        // Update status text
        switch (status) {
            case 'completed':
                stepStatus.textContent = '✅ Completed';
                break;
            case 'active':
                stepStatus.textContent = '⏳ In Progress';
                break;
            case 'error':
                stepStatus.textContent = '❌ Failed';
                break;
            case 'warning':
                stepStatus.textContent = '⚠️ Warning';
                break;
            default:
                stepStatus.textContent = 'Pending';
        }
    }
    
    updateRegistrationBadge(isRegistered) {
        if (!this.faceRegistrationBadge) return;
        
        if (isRegistered) {
            this.faceRegistrationBadge.textContent = '👤 Registered';
            this.faceRegistrationBadge.className = 'face-badge registered';
        } else {
            this.faceRegistrationBadge.textContent = '👤 Not Registered';
            this.faceRegistrationBadge.className = 'face-badge not-registered';
        }
        
        this.faceRegistrationBadge.classList.remove('hidden');
    }
    
    showFaceRegistration() {
        if (this.faceRegistrationSection && !this.isRegistered) {
            this.faceRegistrationSection.classList.remove('hidden');
        }
    }
    
    hideFaceRegistration() {
        if (this.faceRegistrationSection) {
            this.faceRegistrationSection.classList.add('hidden');
        }
    }
    
    showStatus(message, type = '') {
        if (!this.registrationStatus) return;
        
        this.registrationStatus.textContent = message;
        this.registrationStatus.className = `registration-status ${type}`;
        
        if (message) {
            this.registrationStatus.classList.remove('hidden');
        } else {
            this.registrationStatus.classList.add('hidden');
        }
    }
    
    resetRegisterButton() {
        this.registerFaceBtn.disabled = false;
        this.registerFaceBtn.textContent = 'Register Face';
    }
    
    updateUI() {
        // Hide/show face registration section based on service availability and registration status
        if (!this.faceRecognitionEnabled) {
            this.hideFaceRegistration();
            this.updateRegistrationBadge(false);
        } else if (!this.isRegistered) {
            this.showFaceRegistration();
            this.updateRegistrationBadge(false);
        } else {
            this.hideFaceRegistration();
            this.updateRegistrationBadge(true);
        }
        
        // Update verification card visibility
        if (this.verificationCard) {
            if (this.faceRecognitionEnabled) {
                this.verificationCard.classList.remove('hidden');
            } else {
                this.verificationCard.classList.add('hidden');
            }
        }
    }
    
    // Public methods for external access
    getRegistrationStatus() {
        return {
            isRegistered: this.isRegistered,
            serviceEnabled: this.faceRecognitionEnabled,
            hasSelectedFile: !!this.selectedFile
        };
    }
    
    reset() {
        this.isRegistered = false;
        this.clearSelection();
        this.updateUI();
        this.showStatus('', '');
        this.updateVerificationSteps(1, 'pending');
        this.updateVerificationSteps(2, 'pending');
        this.updateVerificationSteps(3, 'pending');
    }
}

// Initialize face registration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.faceRegistration = new FaceRegistration();
    Utils.log('Face registration manager loaded');
});