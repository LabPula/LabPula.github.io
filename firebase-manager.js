// Firebase Integration for GTD Task Manager

class FirebaseTaskManager {
    constructor() {
        this.db = null;
        this.auth = null;
        this.user = null;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.unsubscribes = [];
        this.authType = 'guest'; // 'email' or 'guest'
        
        this.init();
    }

    async init() {
        // Wait for Firebase to be available
        if (!window.firebaseDb || !window.firebaseAuth) {
            setTimeout(() => this.init(), 100);
            return;
        }

        this.db = window.firebaseDb;
        this.auth = window.firebaseAuth;
        
        // Import Firestore functions
        const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        this.firestoreModules = firestoreModule;

        this.setupNetworkListener();
        
        // Check authentication status
        await this.checkAuthStatus();
    }

    async checkAuthStatus() {
        // Check localStorage for user auth data
        const savedAuth = localStorage.getItem('userAuth');
        
        if (savedAuth) {
            const authData = JSON.parse(savedAuth);
            this.authType = authData.authType;
            
            if (this.authType === 'guest') {
                // Handle guest user
                this.user = authData;
                this.updateUserStatus(true, 'guest');
                this.updateSyncStatus('offline', 'Guest mode - Local storage only');
                return;
            } else if (this.authType === 'email') {
                // Wait for Firebase auth state
                this.setupAuthListener();
                return;
            }
        }
        
        // No auth found, redirect to auth page
        if (window.location.pathname !== '/auth.html' && !window.location.pathname.endsWith('auth.html')) {
            window.location.href = 'auth.html';
        }
    }

    setupAuthListener() {
        const { onAuthStateChanged } = window.firebaseModules;
        
        onAuthStateChanged(this.auth, (user) => {
            this.user = user;
            if (user) {
                console.log('User signed in:', user.uid);
                this.updateUserStatus(true, 'email');
                this.updateSyncStatus('synced', 'Connected');
                this.setupRealtimeSync();
            } else {
                console.log('User signed out');
                // Clear auth and redirect
                localStorage.removeItem('userAuth');
                if (window.location.pathname !== '/auth.html' && !window.location.pathname.endsWith('auth.html')) {
                    window.location.href = 'auth.html';
                }
            }
        });
    }

    setupNetworkListener() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.enableFirebaseNetwork();
            this.updateSyncStatus('synced', 'Back online');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateSyncStatus('offline', 'Working offline');
        });
    }

    async enableFirebaseNetwork() {
        try {
            const { enableNetwork } = window.firebaseModules;
            await enableNetwork(this.db);
        } catch (error) {
            console.error('Failed to enable network:', error);
        }
    }

    async disableFirebaseNetwork() {
        try {
            const { disableNetwork } = window.firebaseModules;
            await disableNetwork(this.db);
        } catch (error) {
            console.error('Failed to disable network:', error);
        }
    }

    getUserTasksRef() {
        if (!this.user) return null;
        const { collection } = this.firestoreModules;
        return collection(this.db, 'users', this.user.uid, 'tasks');
    }

    async setupRealtimeSync() {
        if (!this.user) return;

        try {
            const { onSnapshot, orderBy, query } = this.firestoreModules;
            const tasksRef = this.getUserTasksRef();
            
            if (!tasksRef) return;

            // Listen for real-time updates
            const q = query(tasksRef, orderBy('createdAt', 'desc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const tasks = [];
                snapshot.forEach((doc) => {
                    tasks.push({ id: doc.id, ...doc.data() });
                });
                
                // Update local tasks without triggering save
                if (window.gtdApp) {
                    window.gtdApp.tasks = tasks;
                    window.gtdApp.renderTasks();
                    window.gtdApp.updateStatistics();
                }
                
                this.updateSyncStatus('synced', 'Tasks synced');
            }, (error) => {
                console.error('Firestore sync error:', error);
                this.updateSyncStatus('error', 'Sync error');
            });

            this.unsubscribes.push(unsubscribe);
        } catch (error) {
            console.error('Failed to setup realtime sync:', error);
        }
    }

    async saveTask(task) {
        if (!this.user || this.syncInProgress) return false;

        // For guest users, don't save to Firebase
        if (this.authType === 'guest') {
            return true; // Let the main app handle localStorage
        }

        try {
            this.syncInProgress = true;
            this.updateSyncStatus('syncing', 'Saving task...');

            const { doc, setDoc, serverTimestamp } = this.firestoreModules;
            const tasksRef = this.getUserTasksRef();
            
            if (!tasksRef) return false;

            const taskData = {
                ...task,
                userId: this.user.uid,
                updatedAt: serverTimestamp()
            };

            const taskRef = doc(tasksRef, task.id);
            await setDoc(taskRef, taskData, { merge: true });
            
            this.updateSyncStatus('synced', 'Task saved');
            return true;
        } catch (error) {
            console.error('Failed to save task:', error);
            this.updateSyncStatus('error', 'Save failed');
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    async saveAllTasks(tasks) {
        if (!this.user || this.syncInProgress) return false;

        try {
            this.syncInProgress = true;
            this.updateSyncStatus('syncing', 'Syncing all tasks...');

            const { writeBatch, doc, serverTimestamp } = this.firestoreModules;
            const batch = writeBatch(this.db);
            const tasksRef = this.getUserTasksRef();
            
            if (!tasksRef) return false;

            tasks.forEach((task) => {
                const taskRef = doc(tasksRef, task.id);
                const taskData = {
                    ...task,
                    userId: this.user.uid,
                    updatedAt: serverTimestamp()
                };
                batch.set(taskRef, taskData, { merge: true });
            });

            await batch.commit();
            this.updateSyncStatus('synced', 'All tasks synced');
            return true;
        } catch (error) {
            console.error('Failed to save all tasks:', error);
            this.updateSyncStatus('error', 'Bulk save failed');
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    async deleteTask(taskId) {
        if (!this.user || this.syncInProgress) return false;

        // For guest users, don't delete from Firebase
        if (this.authType === 'guest') {
            return true; // Let the main app handle localStorage
        }

        try {
            this.syncInProgress = true;
            this.updateSyncStatus('syncing', 'Deleting task...');

            const { doc, deleteDoc } = this.firestoreModules;
            const tasksRef = this.getUserTasksRef();
            
            if (!tasksRef) return false;

            const taskRef = doc(tasksRef, taskId);
            await deleteDoc(taskRef);
            
            this.updateSyncStatus('synced', 'Task deleted');
            return true;
        } catch (error) {
            console.error('Failed to delete task:', error);
            this.updateSyncStatus('error', 'Delete failed');
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    async loadTasks() {
        if (!this.user) return [];

        try {
            this.updateSyncStatus('syncing', 'Loading tasks...');

            const { getDocs, orderBy, query } = this.firestoreModules;
            const tasksRef = this.getUserTasksRef();
            
            if (!tasksRef) return [];

            const q = query(tasksRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            
            const tasks = [];
            snapshot.forEach((doc) => {
                tasks.push({ id: doc.id, ...doc.data() });
            });

            this.updateSyncStatus('synced', 'Tasks loaded');
            return tasks;
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.updateSyncStatus('error', 'Load failed');
            return [];
        }
    }

    updateSyncStatus(status, message) {
        const syncStatus = document.getElementById('syncStatus');
        const syncIndicator = document.getElementById('syncIndicator');
        
        if (!syncStatus || !syncIndicator) return;

        syncStatus.classList.remove('hidden');
        
        let statusClass = '';
        let statusIcon = '';
        
        switch (status) {
            case 'synced':
                statusClass = 'bg-green-500/20 text-green-400';
                statusIcon = '✅';
                break;
            case 'syncing':
                statusClass = 'bg-yellow-500/20 text-yellow-400';
                statusIcon = '🔄';
                break;
            case 'offline':
                statusClass = 'bg-gray-500/20 text-gray-400';
                statusIcon = '📱';
                break;
            case 'error':
                statusClass = 'bg-red-500/20 text-red-400';
                statusIcon = '❌';
                break;
        }
        
        syncIndicator.className = `text-xs px-2 py-1 rounded-full ${statusClass}`;
        syncIndicator.textContent = `${statusIcon} ${message}`;
    }

    updateUserStatus(isSignedIn, authType = 'email') {
        const userStatus = document.getElementById('userStatus');
        const userIndicator = document.getElementById('userIndicator');
        
        if (!userStatus || !userIndicator) return;

        if (isSignedIn) {
            userStatus.classList.remove('hidden');
            
            if (authType === 'guest') {
                userIndicator.textContent = '👤 Guest Mode';
                userIndicator.className = 'text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400';
            } else {
                const savedAuth = JSON.parse(localStorage.getItem('userAuth') || '{}');
                const displayName = savedAuth.displayName || this.user?.displayName || this.user?.email?.split('@')[0] || 'User';
                userIndicator.textContent = `👤 ${displayName}`;
                userIndicator.className = 'text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400';
            }
        } else {
            userStatus.classList.add('hidden');
        }
    }

    async toggleOfflineMode() {
        if (this.isOnline) {
            await this.disableFirebaseNetwork();
            this.updateSyncStatus('offline', 'Offline mode enabled');
        } else {
            await this.enableFirebaseNetwork();
            this.updateSyncStatus('synced', 'Online mode enabled');
        }
    }

    async signOut() {
        try {
            // Clear localStorage
            localStorage.removeItem('userAuth');
            
            // Sign out from Firebase if authenticated with email
            if (this.authType === 'email' && this.auth.currentUser) {
                await this.auth.signOut();
            }
            
            this.cleanup();
            
            // Redirect to auth page
            window.location.href = 'auth.html';
        } catch (error) {
            console.error('Failed to sign out:', error);
            // Still redirect on error
            window.location.href = 'auth.html';
        }
    }

    cleanup() {
        // Unsubscribe from all listeners
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
        
        this.updateSyncStatus('offline', 'Signed out');
        this.updateUserStatus(false);
    }
}

// Initialize Firebase manager
window.firebaseManager = new FirebaseTaskManager();
