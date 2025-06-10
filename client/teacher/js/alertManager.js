// Enhanced Alert Manager with Face Recognition Support
class AlertManager {

// Updated AlertManager constructor and initialization to handle missing elements gracefully

    constructor() {
        // Use optional chaining and provide fallbacks for missing elements
        this.alertsList = document.getElementById('alertsList');
        this.clearAlertsBtn = document.getElementById('clearAlertsBtn');
        this.alertFilters = document.querySelectorAll('.filter-btn');
        
        // Face recognition alert modal elements (optional)
        this.faceAlertModal = document.getElementById('faceAlertModal');
        this.closeFaceAlertBtn = document.getElementById('closeFaceAlertBtn');
        this.viewStudentBtn = document.getElementById('viewStudentBtn');
        this.markResolvedBtn = document.getElementById('markResolvedBtn');
        this.dismissAlertBtn = document.getElementById('dismissAlertBtn');
        
        this.alerts = new Map();
        this.currentFilter = 'all';
        this.maxAlerts = 100;
        
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.updateAlertsDisplay();
        
        // Listen for monitoring alerts
        document.addEventListener('monitoringAlert', (event) => {
            this.addAlert(event.detail.type, event.detail.data);
        });
        
        // Listen for alert cleared events
        document.addEventListener('alertCleared', (event) => {
            this.removeAlert(event.detail.type, event.detail.studentSocketId);
        });
        
        document.addEventListener('allAlertsCleared', () => {
            this.clearAllAlerts();
        });
        
        Utils.log('Alert manager initialized with face recognition support');
    }

    setupEventListeners() {
        // Clear alerts button - only if it exists
        if (this.clearAlertsBtn) {
            this.clearAlertsBtn.addEventListener('click', () => {
                this.clearAllAlerts();
            });
        }
        
        // Alert filter buttons - only if they exist
        if (this.alertFilters && this.alertFilters.length > 0) {
            this.alertFilters.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setFilter(btn.dataset.filter);
                });
            });
        }
        
        // Face recognition alert modal handlers - only if they exist
        if (this.closeFaceAlertBtn) {
            this.closeFaceAlertBtn.addEventListener('click', () => {
                this.closeFaceAlertModal();
            });
        }
        
        if (this.viewStudentBtn) {
            this.viewStudentBtn.addEventListener('click', () => {
                this.viewStudentFromAlert();
            });
        }
        
        if (this.markResolvedBtn) {
            this.markResolvedBtn.addEventListener('click', () => {
                this.markAlertResolved();
            });
        }
        
        if (this.dismissAlertBtn) {
            this.dismissAlertBtn.addEventListener('click', () => {
                this.dismissAlert();
            });
        }
        
        // Close modal when clicking outside - only if modal exists
        if (this.faceAlertModal) {
            this.faceAlertModal.addEventListener('click', (event) => {
                if (event.target === this.faceAlertModal) {
                    this.closeFaceAlertModal();
                }
            });
        }
        
        // Keyboard shortcuts for modal
        document.addEventListener('keydown', (event) => {
            if (this.faceAlertModal && !this.faceAlertModal.classList.contains('hidden')) {
                switch (event.key) {
                    case 'Escape':
                        this.closeFaceAlertModal();
                        break;
                    case 'Enter':
                        this.viewStudentFromAlert();
                        break;
                    case 'r':
                    case 'R':
                        if (event.ctrlKey || event.metaKey) {
                            event.preventDefault();
                            this.markAlertResolved();
                        }
                        break;
                }
            }
        });
    }
    
    addAlert(type, alertData) {
        const alertId = `${type}-${alertData.studentSocketId}-${Date.now()}`;
        
        const alert = {
            id: alertId,
            type: type,
            studentSocketId: alertData.studentSocketId,
            studentName: alertData.studentName,
            studentId: alertData.studentId,
            message: alertData.alert.message,
            severity: alertData.alert.severity,
            timestamp: new Date(alertData.timestamp),
            alertType: alertData.alert.type,
            confidence: alertData.alert.confidence,
            duration: alertData.alert.duration,
            count: alertData.alert.count,
            resolved: false
        };
        
        this.alerts.set(alertId, alert);
        
        // Limit number of alerts
        if (this.alerts.size > this.maxAlerts) {
            const oldestAlert = Array.from(this.alerts.keys())[0];
            this.alerts.delete(oldestAlert);
        }
        
        this.updateAlertsDisplay();
        this.updateAlertCounts();
        
        // Show desktop notification for critical alerts
        if (alert.severity === 'danger') {
            this.showDesktopNotification(alert);
        }
        
        Utils.log(`Alert added: ${type} - ${alert.message}`);
    }
    
    removeAlert(type, studentSocketId) {
        // Find and remove alerts for this student and type
        const alertsToRemove = Array.from(this.alerts.entries())
            .filter(([id, alert]) => 
                alert.type === type && alert.studentSocketId === studentSocketId
            )
            .map(([id]) => id);
        
        alertsToRemove.forEach(id => this.alerts.delete(id));
        
        this.updateAlertsDisplay();
        this.updateAlertCounts();
    }
    
    clearAllAlerts() {
        this.alerts.clear();
        this.updateAlertsDisplay();
        this.updateAlertCounts();
        
        // Clear alerts in WebSocket manager
        window.teacherWebSocket.clearAllAlerts();
        
        Utils.showNotification('All alerts cleared', 'info');
        Utils.log('All alerts cleared');
    }
    
    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update filter button states
        this.alertFilters.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        this.updateAlertsDisplay();
    }
    
    updateAlertsDisplay() {
        if (!this.alertsList) return;
        
        const filteredAlerts = this.getFilteredAlerts();
        
        if (filteredAlerts.length === 0) {
            this.alertsList.innerHTML = '<p class="no-alerts">No active alerts</p>';
            return;
        }
        
        // Sort alerts by timestamp (newest first) and severity
        filteredAlerts.sort((a, b) => {
            // First by severity (danger > warning > info)
            const severityOrder = { danger: 3, warning: 2, info: 1 };
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[b.severity] - severityOrder[a.severity];
            }
            // Then by timestamp (newest first)
            return b.timestamp - a.timestamp;
        });
        
        this.alertsList.innerHTML = filteredAlerts.map(alert => this.createAlertHTML(alert)).join('');
        
        // Add click handlers for alert items
        this.alertsList.querySelectorAll('.alert-item').forEach(item => {
            item.addEventListener('click', () => {
                const alertId = item.dataset.alertId;
                this.handleAlertClick(alertId);
            });
            
            // Add resolve button handler
            const resolveBtn = item.querySelector('.resolve-btn');
            if (resolveBtn) {
                resolveBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.resolveAlert(item.dataset.alertId);
                });
            }
        });
    }
    
    createAlertHTML(alert) {
        const timeStr = Utils.formatTime(alert.timestamp);
        const ageStr = this.getAlertAge(alert.timestamp);
        
        // Get type-specific icon and color
        const typeInfo = this.getAlertTypeInfo(alert.type);
        
        // Build additional info based on alert type
        let additionalInfo = '';
        if (alert.confidence !== undefined) {
            additionalInfo += `<span class="alert-confidence">Confidence: ${Math.round(alert.confidence * 100)}%</span>`;
        }
        if (alert.duration !== undefined) {
            additionalInfo += `<span class="alert-duration">Duration: ${alert.duration}</span>`;
        }
        if (alert.count !== undefined) {
            additionalInfo += `<span class="alert-count">Count: ${alert.count}</span>`;
        }
        
        return `
            <div class="alert-item ${alert.severity} ${alert.type}-alert ${alert.resolved ? 'resolved' : ''}" 
                 data-alert-id="${alert.id}" 
                 data-student-socket-id="${alert.studentSocketId}">
                <div class="alert-header">
                    <div class="alert-type-info">
                        <span class="alert-icon">${typeInfo.icon}</span>
                        <span class="alert-type-label">${typeInfo.label}</span>
                    </div>
                    <div class="alert-time">
                        <span class="alert-timestamp" title="${timeStr}">${ageStr}</span>
                        ${!alert.resolved ? '<button class="resolve-btn" title="Mark as resolved">✓</button>' : '<span class="resolved-badge">✓</span>'}
                    </div>
                </div>
                <div class="alert-content">
                    <div class="alert-student">
                        <strong>${alert.studentName}</strong> (ID: ${alert.studentId})
                    </div>
                    <div class="alert-message">${alert.message}</div>
                    ${additionalInfo ? `<div class="alert-additional">${additionalInfo}</div>` : ''}
                </div>
            </div>
        `;
    }
    
    getAlertTypeInfo(type) {
        const typeMap = {
            gaze: { icon: '👁️', label: 'Gaze' },
            ai: { icon: '🤖', label: 'AI Detection' },
            face: { icon: '👤', label: 'Face Recognition' }
        };
        
        return typeMap[type] || { icon: '⚠️', label: 'Unknown' };
    }
    
    getAlertAge(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }
    
    getFilteredAlerts() {
        const alerts = Array.from(this.alerts.values());
        
        if (this.currentFilter === 'all') {
            return alerts;
        }
        
        return alerts.filter(alert => alert.type === this.currentFilter);
    }
    
    handleAlertClick(alertId) {
        const alert = this.alerts.get(alertId);
        if (!alert) return;
        
        // For face recognition alerts, show detailed modal
        if (alert.type === 'face' && alert.severity === 'danger') {
            this.showFaceAlertModal(alert);
        } else {
            // For other alerts, show student in detail view
            this.showStudentDetail(alert.studentSocketId);
        }
    }
    
    showFaceAlertModal(alert) {
        if (!this.faceAlertModal) return;
        
        const details = document.getElementById('faceAlertDetails');
        if (details) {
            details.innerHTML = `
                <div class="alert-student-info">
                    <h4>${alert.studentName} (ID: ${alert.studentId})</h4>
                    <p class="alert-timestamp">${alert.timestamp.toLocaleString()}</p>
                </div>
                <div class="alert-message ${alert.severity}">
                    <strong>${alert.alertType.replace(/_/g, ' ').toUpperCase()}</strong>
                    <p>${alert.message}</p>
                    ${alert.confidence !== undefined ? 
                        `<p>Confidence: ${Math.round(alert.confidence * 100)}%</p>` : ''}
                    ${alert.count !== undefined ? 
                        `<p>Consecutive occurrences: ${alert.count}</p>` : ''}
                </div>
            `;
        }
        
        // Store alert data for modal actions
        this.faceAlertModal.dataset.alertId = alert.id;
        this.faceAlertModal.dataset.studentSocketId = alert.studentSocketId;
        
        this.faceAlertModal.classList.remove('hidden');
    }
    
    closeFaceAlertModal() {
        if (this.faceAlertModal) {
            this.faceAlertModal.classList.add('hidden');
        }
    }
    
    viewStudentFromAlert() {
        const studentSocketId = this.faceAlertModal?.dataset.studentSocketId;
        if (studentSocketId) {
            this.showStudentDetail(studentSocketId);
            this.closeFaceAlertModal();
        }
    }
    
    markAlertResolved() {
        const alertId = this.faceAlertModal?.dataset.alertId;
        if (alertId) {
            this.resolveAlert(alertId);
            this.closeFaceAlertModal();
        }
    }
    
    dismissAlert() {
        this.closeFaceAlertModal();
    }
    
    resolveAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (alert) {
            alert.resolved = true;
            this.updateAlertsDisplay();
            
            // Clear the alert from WebSocket manager
            window.teacherWebSocket.clearAlert(alert.type, alert.studentSocketId);
            
            Utils.showNotification(`Alert resolved for ${alert.studentName}`, 'success');
        }
    }
    
    showStudentDetail(studentSocketId) {
        // Dispatch event to show student in detail view
        const event = new CustomEvent('showStudentDetail', {
            detail: { studentSocketId: studentSocketId }
        });
        document.dispatchEvent(event);
    }
    
    updateAlertCounts() {
        // Update alert count indicators
        const stats = this.getAlertStatistics();
        
        // Update filter buttons with counts
        this.alertFilters.forEach(btn => {
            const filter = btn.dataset.filter;
            const count = filter === 'all' ? stats.total : stats.byType[filter] || 0;
            
            // Update button text with count
            const originalText = btn.textContent.replace(/\s*\(\d+\)/, '');
            btn.textContent = count > 0 ? `${originalText} (${count})` : originalText;
            
            // Add visual indicator for active alerts
            if (count > 0) {
                btn.classList.add('has-alerts');
            } else {
                btn.classList.remove('has-alerts');
            }
        });
        
        // Update global alert counts
        const gazeAlerts = stats.byType.gaze || 0;
        const aiAlerts = stats.byType.ai || 0;
        const faceAlerts = stats.byType.face || 0;
        
        // Update service indicators
        this.updateServiceAlertIndicator('gazeStatus', gazeAlerts);
        this.updateServiceAlertIndicator('aiStatus', aiAlerts);
        this.updateServiceAlertIndicator('faceStatus', faceAlerts);
        
        // Update statistics panel
        const gazeAlertsElement = document.getElementById('gazeAlerts');
        const faceAlertCountElement = document.getElementById('faceAlertCount');
        
        if (gazeAlertsElement) gazeAlertsElement.textContent = gazeAlerts;
        if (faceAlertCountElement) faceAlertCountElement.textContent = faceAlerts;
    }
    
    updateServiceAlertIndicator(indicatorId, alertCount) {
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
            if (alertCount > 0) {
                indicator.classList.add('has-alerts');
                indicator.dataset.alertCount = alertCount;
            } else {
                indicator.classList.remove('has-alerts');
                delete indicator.dataset.alertCount;
            }
        }
    }
    
    getAlertStatistics() {
        const unresolvedAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
        
        const stats = {
            total: unresolvedAlerts.length,
            byType: {},
            bySeverity: {}
        };
        
        unresolvedAlerts.forEach(alert => {
            stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
            stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
        });
        
        return stats;
    }
    
    showDesktopNotification(alert) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`${alert.studentName} - Identity Alert`, {
                body: alert.message,
                icon: '/favicon.ico', // Adjust path as needed
                tag: `face-alert-${alert.studentSocketId}`, // Prevent duplicate notifications
                requireInteraction: true
            });
            
            notification.onclick = () => {
                window.focus();
                this.showStudentDetail(alert.studentSocketId);
                notification.close();
            };
            
            // Auto-close after 10 seconds
            setTimeout(() => notification.close(), 10000);
        }
    }
    
    // Request notification permission
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    Utils.showNotification('Desktop notifications enabled for critical alerts', 'success');
                }
            });
        }
    }
    
    // Public methods
    getActiveAlertCount() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved).length;
    }
    
    getAlertsByStudent(studentSocketId) {
        return Array.from(this.alerts.values()).filter(alert => 
            alert.studentSocketId === studentSocketId && !alert.resolved
        );
    }
    
    exportAlerts() {
        const alerts = Array.from(this.alerts.values());
        const exportData = {
            exported: new Date().toISOString(),
            totalAlerts: alerts.length,
            alerts: alerts.map(alert => ({
                ...alert,
                timestamp: alert.timestamp.toISOString()
            }))
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `monitoring-alerts-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Utils.showNotification('Alerts exported successfully', 'success');
    }
}

// Initialize alert manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.alertManager = new AlertManager();
    
    // Request notification permission after a delay
    setTimeout(() => {
        window.alertManager.requestNotificationPermission();
    }, 3000);
    
    Utils.log('Alert manager loaded and initialized');
});