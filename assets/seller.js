// ✅ seller.js - Production Ready Version

// Global Configuration - uses dynamic getAPIURL() from config.new.js
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

// Session State
const sessionState = {
    otpVerified: false,
    tempSellerLogin: null,
    loginOtpVerified: false,
    retryCount: 0,
    lastAttempt: null,
    resetEmail: null,
    forgotOtpVerified: false
};

// Enhanced Notification System
function showMessage(message, type = 'info', title = '') {
    if (window.notifications) {
        window.notifications.show(message, type);
    } else if (window.toastr) {
        const toastConfig = {
            closeButton: true,
            progressBar: true,
            preventDuplicates: true,
            positionClass: 'toast-top-right',
            timeOut: 5000
        };
        
        toastr[type](message, title, toastConfig);
    } else {
        // Fallback to alert if notification system not loaded
        alert(message);
    }
}

// Validation Functions
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone) {
  const re = /^[6-9]\d{9}$/;
  return re.test(phone);
}

function handleApiError(error, defaultMessage) {
  console.error('API Error:', error);
  if (error.message) {
    showMessage(error.message, 'error');
  } else {
    showMessage(defaultMessage, 'error');
  }
}

// Send OTP for Signup
async function sendSellerOTP(event) {
  const email = document.getElementById("signupEmail").value.trim();

  if (!email) {
    showMessage("Please enter your email to receive OTP", 'error');
    return;
  }

  if (!validateEmail(email)) {
    showMessage("Please enter a valid email address", 'error');
    return;
  }

  const button = event.target;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const res = await fetch(`${getAPIURL()}/sellers/send-otp-email`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok) {
      showMessage(data.message || "OTP sent successfully!", 'success');
      document.getElementById("otpVerifySection").classList.remove("hidden");
    } else {
      showMessage(data.message || "Failed to send OTP", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error. Please check your connection and try again.");
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 10000);
  }
}

// Verify OTP for Signup
async function verifySellerOTP() {
  const email = document.getElementById("signupEmail").value.trim();
  const otp = document.getElementById("signupOtp").value.trim();

  if (!email || !otp) {
    showMessage("Please enter both email and OTP", 'error');
    return;
  }

  if (!validateEmail(email)) {
    showMessage("Please enter a valid email address", 'error');
    return;
  }

  if (otp.length !== 6 || !/^\d+$/.test(otp)) {
    showMessage("Please enter a valid 6-digit OTP", 'error');
    return;
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/verify-otp`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email, otp })
    });

    const data = await res.json();

    if (res.ok) {
      showMessage("OTP Verified! You can now complete signup.", 'success');
      sessionState.otpVerified = true;
      // Enable signup button if it exists
      const signupBtn = document.querySelector('[onclick="submitSellerSignup()"]');
      if (signupBtn) {
        signupBtn.disabled = false;
        signupBtn.style.opacity = '1';
      }
    } else {
      showMessage(data.message || "Invalid OTP. Please try again.", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error occurred while verifying OTP.");
  }
}

// Submit Signup
async function submitSellerSignup() {
  if (!sessionState.otpVerified) {
    showMessage("Please verify OTP before signing up", 'error');
    return;
  }

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const phone = document.getElementById("signupPhone").value.trim();
  const vendorName = document.getElementById("signupVendorName").value.trim();
  const password = document.getElementById("signupPassword").value.trim();
  const confirmPassword = document.getElementById("signupConfirmPassword")?.value.trim();

  // Validation
  if (!name || !email || !phone || !vendorName || !password) {
    showMessage("All fields are required.", 'error');
    return;
  }

  if (!validateEmail(email)) {
    showMessage("Please enter a valid email address", 'error');
    return;
  }

  if (!validatePhone(phone)) {
    showMessage("Please enter a valid 10-digit phone number", 'error');
    return;
  }

  if (password.length < 8) {
    showMessage("Password must be at least 8 characters long", 'error');
    return;
  }

  if (confirmPassword && password !== confirmPassword) {
    showMessage("Passwords do not match", 'error');
    return;
  }

  if (name.length < 2) {
    showMessage("Name must be at least 2 characters long", 'error');
    return;
  }

  if (vendorName.length < 3) {
    showMessage("Vendor name must be at least 3 characters long", 'error');
    return;
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/signup`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ name, email, phone, vendorName, password })
    });

    const data = await res.json();

    if (res.ok) {
      showMessage("Signup successful! You can now login.", 'success');
      // Clear form
      document.getElementById("signupName").value = '';
      document.getElementById("signupEmail").value = '';
      document.getElementById("signupPhone").value = '';
      document.getElementById("signupVendorName").value = '';
      document.getElementById("signupPassword").value = '';
      if (confirmPassword) document.getElementById("signupConfirmPassword").value = '';
      
      // Reset OTP verification status
      sessionState.otpVerified = false;
      document.getElementById("otpVerifySection").classList.add("hidden");
      
      // Switch to login tab
      if (typeof showTab === 'function') {
        showTab("login");
      }
    } else {
      showMessage(data.message || "Signup failed. Please try again.", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error occurred during signup. Please try again.");
  }
}

// Login Handler - Production Ready
async function handleSellerLogin() {
  const emailOrPhone = document.getElementById("loginEmailOrPhone").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!emailOrPhone || !password) {
    showMessage("Please enter both email/phone and password", 'error');
    return;
  }

  // Validate input format
  const isEmail = emailOrPhone.includes('@');
  if (isEmail && !validateEmail(emailOrPhone)) {
    showMessage("Please enter a valid email address", 'error');
    return;
  }
  
  if (!isEmail && !validatePhone(emailOrPhone)) {
    showMessage("Please enter a valid phone number", 'error');
    return;
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ emailOrPhone, password })
    });

    const data = await res.json();

    if (res.ok) {
      // Store login data temporarily until OTP verification
      sessionState.tempSellerLogin = data;
      document.getElementById("loginOtpSection").classList.remove("hidden");
      showMessage("Credentials verified. Please check your email for OTP.", 'success');
      
      // Auto-send OTP after successful login
      setTimeout(() => {
        sendLoginOTP();
      }, 1000);
    } else {
      showMessage(data.message || "Invalid credentials. Please try again.", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error occurred during login. Please try again.");
  }
}

// Send OTP for Login
async function sendLoginOTP(event) {
  const emailOrPhone = document.getElementById("loginEmailOrPhone").value.trim();
  if (!emailOrPhone) {
    showMessage("Please enter email/phone first.", 'error');
    return;
  }

  const button = event.target;
  const originalText = button ? button.textContent : "Send OTP";
  
  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/send-otp-email`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email: emailOrPhone })
    });

    const data = await res.json();
    
    if (res.ok) {
      showMessage(data.message || "OTP sent successfully!", 'success');
    } else {
      showMessage(data.message || "Failed to send OTP", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error occurred while sending OTP.");
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 10000);
    }
  }
}

// Verify Login OTP
async function verifyLoginOTP() {
  const email = document.getElementById("loginEmailOrPhone").value.trim();
  const otp = document.getElementById("loginOtp").value.trim();

  if (!email || !otp) {
    showMessage("Please enter both email and OTP", 'error');
    return;
  }

  if (otp.length !== 6 || !/^\d+$/.test(otp)) {
    showMessage("Please enter a valid 6-digit OTP", 'error');
    return;
  }

  if (!sessionState.tempSellerLogin) {
    showMessage("Please login first before verifying OTP", 'error');
    return;
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/verify-otp`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email, otp })
    });

    const data = await res.json();

    if (res.ok) {
      showMessage("Login successful! Redirecting to dashboard...", 'success');
      
      // Store authentication token
      localStorage.setItem("sellerAuthToken", data.token);    // use token from OTP verification response

      // Store seller info for dashboard use
      localStorage.setItem("sellerInfo", JSON.stringify({
        id: sessionState.tempSellerLogin.seller.id,
        name: sessionState.tempSellerLogin.seller.name,
        email: sessionState.tempSellerLogin.seller.email,
        vendorName: sessionState.tempSellerLogin.seller.vendorName
      }));
      
      // Clear temporary data
      sessionState.tempSellerLogin = null;
      sessionState.loginOtpVerified = false;
      
      // Clear form
      document.getElementById("loginEmailOrPhone").value = '';
      document.getElementById("loginPassword").value = '';
      document.getElementById("loginOtp").value = '';
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } else {
      showMessage(data.message || "Invalid OTP. Please try again.", 'error');
    }
  } catch (err) {
    handleApiError(err, "Network error occurred while verifying OTP.");
  }
}
// ==============================
// ✅ Forgot Password Flow
// ==============================

// Step 1: Send OTP to email
async function sendForgotOtp(event) {
  const email = document.getElementById("forgotEmail").value.trim();
  if (!email) return alert("Enter your registered email");

  const button = event.target;
  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const res = await fetch(`${getAPIURL()}/sellers/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    alert(data.message);

    if (res.ok) {
      sessionState.resetEmail = email;
      document.getElementById("forgotOtpSection").classList.remove("hidden");
    }
  } catch (err) {
    alert("Failed to send OTP");
  }

  setTimeout(() => {
    button.disabled = false;
    button.textContent = "Send OTP";
  }, 10000);
}

// Step 2: Verify OTP
async function verifyForgotOtp() {
  const otp = document.getElementById("forgotOtp").value.trim();
  if (!sessionState.resetEmail || !otp) return alert("Email and OTP required");

  try {
    const res = await fetch(`${getAPIURL()}/sellers/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sessionState.resetEmail, otp })
    });

    const data = await res.json();
    if (res.ok) {
      sessionState.forgotOtpVerified = true;
      document.getElementById("resetPasswordSection").classList.remove("hidden");
      alert("OTP verified! You can now reset your password.");
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("OTP verification failed");
  }
}

// Step 3: Reset password
async function resetForgotPassword() {
  const newPassword = document.getElementById("forgotNewPassword").value.trim();
  if (!sessionState.resetEmail || !sessionState.forgotOtpVerified || !newPassword) {
    return alert("Please verify OTP and enter new password");
  }

  try {
    const res = await fetch(`${getAPIURL()}/sellers/forgot-password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sessionState.resetEmail, newPassword })
    });

    const data = await res.json();
    if (res.ok) {
  alert("Password reset successful. You can now log in.");
  showTab("login");
  location.reload(); // ✅ Refresh the page to clear any temp states
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Password reset failed");
  }
}
