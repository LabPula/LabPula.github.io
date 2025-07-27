class AuthManager {
    constructor() {
        this.auth = window.firebaseAuth;
        this.modules = window.firebaseModules;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Form toggle buttons
        document.getElementById('showRegisterBtn').addEventListener('click', () => this.showRegisterForm());
        document.getElementById('showSignInBtn').addEventListener('click', () => this.showSignInForm());
        
        // Form submissions
        document.getElementById('signInFormElement').addEventListener('submit', (e) => this.handleSignIn(e));
        document.getElementById('registerFormElement').addEventListener('submit', (e) => this.handleRegister(e));
        
        // Continue as guest
        document.getElementById('continueAsGuest').addEventListener('click', () => this.continueAsGuest());
        
        // Real-time password validation
        document.getElementById('confirmPassword').addEventListener('input', () => this.validatePasswordMatch());
        document.getElementById('registerPassword').addEventListener('input', () => this.validatePasswordMatch());
    }

    showRegisterForm() {
        document.getElementById('signInForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
        this.hideMessage();
    }

    showSignInForm() {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('signInForm').classList.remove('hidden');
        this.hideMessage();
    }

    validatePasswordMatch() {
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const confirmField = document.getElementById('confirmPassword');
        
        if (confirmPassword && password !== confirmPassword) {
            confirmField.style.borderColor = '#ef4444';
            this.showMessage('Passwords do not match', 'error');
        } else {
            confirmField.style.borderColor = '';
            this.hideMessage();
        }
    }

    async handleSignIn(e) {
        e.preventDefault();
        
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;
        const submitBtn = document.getElementById('signInBtn');
        
        this.setLoading(submitBtn, true);
        this.hideMessage();
        
        try {
            const userCredential = await this.modules.signInWithEmailAndPassword(this.auth, email, password);
            
            this.showMessage('Successfully signed in! Redirecting...', 'success');
            
            // Store user info in localStorage
            localStorage.setItem('userAuth', JSON.stringify({
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: userCredential.user.displayName || email.split('@')[0],
                authType: 'email'
            }));
            
            // Redirect to main app
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            
        } catch (error) {
            console.error('Sign in error:', error);
            this.showMessage(this.getErrorMessage(error.code), 'error');
        } finally {
            this.setLoading(submitBtn, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const firstName = document.getElementById('registerFirstName').value;
        const lastName = document.getElementById('registerLastName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const submitBtn = document.getElementById('registerBtn');
        
        // Validation
        if (password !== confirmPassword) {
            this.showMessage('Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 6) {
            this.showMessage('Password must be at least 6 characters', 'error');
            return;
        }
        
        this.setLoading(submitBtn, true);
        this.hideMessage();
        
        try {
            // Create user
            const userCredential = await this.modules.createUserWithEmailAndPassword(this.auth, email, password);
            
            // Update profile with name
            const displayName = `${firstName} ${lastName}`;
            await this.modules.updateProfile(userCredential.user, { displayName });
            
            this.showMessage('Account created successfully! Redirecting...', 'success');
            
            // Store user info in localStorage
            localStorage.setItem('userAuth', JSON.stringify({
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: displayName,
                firstName: firstName,
                lastName: lastName,
                authType: 'email'
            }));
            
            // Redirect to main app
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            
        } catch (error) {
            console.error('Register error:', error);
            this.showMessage(this.getErrorMessage(error.code), 'error');
        } finally {
            this.setLoading(submitBtn, false);
        }
    }

    continueAsGuest() {
        // Store guest info
        localStorage.setItem('userAuth', JSON.stringify({
            uid: 'guest_' + Date.now(),
            email: 'guest@example.com',
            displayName: 'Guest User',
            authType: 'guest'
        }));
        
        // Redirect to main app
        window.location.href = 'index.html';
    }

    setLoading(button, loading) {
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        
        if (loading) {
            btnText.classList.add('hidden');
            btnLoading.classList.remove('hidden');
            button.disabled = true;
        } else {
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
            button.disabled = false;
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = document.getElementById('authMessage');
        const contentEl = document.getElementById('messageContent');
        
        messageEl.className = `auth-message ${type}`;
        contentEl.textContent = message;
        messageEl.classList.remove('hidden');
        
        // Auto-hide error messages after 5 seconds
        if (type === 'error') {
            setTimeout(() => this.hideMessage(), 5000);
        }
    }

    hideMessage() {
        document.getElementById('authMessage').classList.add('hidden');
    }

    getErrorMessage(errorCode) {
        const errorMessages = {
            'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
            'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Please check your connection.'
        };
        
        return errorMessages[errorCode] || 'An error occurred. Please try again.';
    }
}

// Initialize auth manager when Firebase is ready
function initializeAuth() {
    if (window.firebaseAuth && window.firebaseModules) {
        new AuthManager();
    } else {
        // Wait for Firebase to initialize
        setTimeout(initializeAuth, 100);
    }
}

// Start initialization
initializeAuth();
