/**
 * Neuro Harmony Clinic - Telehealth Web Application
 * Client-side State, Scheduler, Payment Gateway Simulator, WebRTC simulation, and Prescription Engine
 */

class TelehealthApp {
  constructor() {
    this.dbUrl = "https://jsonbin-zeta.vercel.app/api/bins/nsqjw87e5_";
    this.apiBaseUrl = "http://localhost:5000/api/v1";
    this.doctorProfileId = null;

    // Initial State
    this.bookings = JSON.parse(localStorage.getItem('nh_bookings')) || this.getMockBookings();
    this.reviews = JSON.parse(localStorage.getItem('nh_reviews')) || this.getMockReviews();
    this.feedbackRating = 5; // Default feedback modal stars
    
    // Patient Portal State
    this.currentPatient = JSON.parse(localStorage.getItem('nh_current_patient')) || null;
    this.patientAuthTab = 'login';
    this.patientAuthOTPCode = '';
    this.patientAuthPhoneInput = '';
    this.patientAuthNameInput = '';

    this.activeBooking = null;
    
    this.selectedDate = null;
    this.selectedSlot = null;
    this.uploadedFileName = '';
    
    this.chatMessages = [];
    this.callTimerInterval = null;
    this.callDurationSeconds = 0;
    this.isMicMuted = false;
    this.isCamOff = false;
    
    this.localVideoStream = null;
    this.localAnimationId = null;
    this.remoteAnimationId = null;

    this.activePrescriptionMeds = [];
    this.consultingBookingId = null;
    
    // Bindings
    this.init();
    this.loadDoctorProfile();
  }


  init() {
    // Generate dates slider
    this.generateCalendar();
    
    // Select today's date by default
    const firstDateCard = document.querySelector('.date-card');
    if (firstDateCard) {
      firstDateCard.click();
    }

    // Set countdown if there's an active booking that hasn't started yet
    this.checkUpcomingBookings();
    
    // Load bookings in doctor dashboard
    this.renderDoctorDashboard();

    // Render testimonials & review statistics
    this.renderReviews();

    // Render patient portal initial layout
    this.renderPatientDashboard();

    // Initial database sync and background interval polling
    this.syncDb();
    setInterval(() => {
      this.syncDb();
    }, 10000);
  }

  async loadDoctorProfile() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/doctors`);
      const data = await response.json();
      if (data.success && data.doctors.length > 0) {
        this.doctorProfileId = data.doctors[0].id;
        this.generateCalendar();
      }
    } catch (err) {
      console.error('Failed to load doctor profile from backend:', err);
    }
  }

  async resumeRazorpayCheckout(appointmentId) {
    const token = localStorage.getItem('nh_token');
    if (!token) return;

    try {
      const orderRes = await fetch(`${this.apiBaseUrl}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointmentId })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        alert('Failed to resume payment checkout.');
        return;
      }

      const self = this;
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Neuro Harmony Clinic',
        description: 'Telehealth Neuropsychiatry Consultation',
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${self.apiBaseUrl}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              alert('Payment successful!');
              self.renderPatientDashboard();
            } else {
              alert('Verification failed: ' + verifyData.message);
            }
          } catch (err) {
            console.error(err);
            alert('Error verifying payment.');
          }
        },
        theme: {
          color: '#0f766e'
        }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error(err);
      alert('Error connecting to payment gateway.');
    }
  }

  normalizePhone(phoneStr) {
    if (!phoneStr) return '';
    let clean = phoneStr.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
      clean = clean.substring(2);
    }
    if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.substring(1);
    }
    return clean;
  }

  async syncDb() {
    const dbUrl = this.dbUrl;
    try {
      const response = await fetch(dbUrl);
      if (!response.ok) return;
      const cloudData = await response.json();
      
      // 1. Merge bookings
      const localBookings = JSON.parse(localStorage.getItem('nh_bookings')) || this.bookings;
      const mergedBookingsMap = new Map();
      
      // Load cloud first
      if (cloudData.bookings && Array.isArray(cloudData.bookings)) {
        cloudData.bookings.forEach(b => mergedBookingsMap.set(b.id, b));
      }
      // Overwrite/Add local
      localBookings.forEach(b => {
        const existing = mergedBookingsMap.get(b.id);
        if (!existing) {
          mergedBookingsMap.set(b.id, b);
        } else {
          // Keep completed status, reviews, or active prescriptions if local has it
          if (b.status === 'completed' || b.prescription) {
            mergedBookingsMap.set(b.id, b);
          }
        }
      });
      this.bookings = Array.from(mergedBookingsMap.values());
      localStorage.setItem('nh_bookings', JSON.stringify(this.bookings));

      // 2. Merge reviews
      const localReviews = JSON.parse(localStorage.getItem('nh_reviews')) || this.reviews;
      const reviewsMap = new Map();
      if (cloudData.reviews && Array.isArray(cloudData.reviews)) {
        cloudData.reviews.forEach(r => {
          const key = `${r.name}_${r.date}_${r.comment.substring(0, 20)}`;
          reviewsMap.set(key, r);
        });
      }
      localReviews.forEach(r => {
        const key = `${r.name}_${r.date}_${r.comment.substring(0, 20)}`;
        reviewsMap.set(key, r);
      });
      this.reviews = Array.from(reviewsMap.values());
      localStorage.setItem('nh_reviews', JSON.stringify(this.reviews));

      // 3. Merge patients
      const localPatients = JSON.parse(localStorage.getItem('nh_patients')) || {};
      const mergedPatients = { ...cloudData.patients, ...localPatients };
      localStorage.setItem('nh_patients', JSON.stringify(mergedPatients));

      // Save to cloud
      const updateData = {
        bookings: this.bookings,
        reviews: this.reviews,
        patients: mergedPatients
      };

      await fetch(dbUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      // Render UI
      this.renderDoctorDashboard();
      this.renderPatientDashboard();
      this.renderReviews();
    } catch (e) {
      console.error("Database sync error:", e);
    }
  }

  // Navigations
  navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });

    // Remove active state from nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });

    // Show selected view
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
      targetSection.classList.add('active');
      window.scrollTo(0, 0);
    }

    // Highlight nav link
    if (viewId === 'landing-view') {
      const el = document.getElementById('nav-home');
      if (el) el.classList.add('active');
    } else if (viewId === 'patient-portal-view') {
      const el = document.getElementById('nav-patient');
      if (el) el.classList.add('active');
      this.renderPatientDashboard();
    } else if (viewId === 'booking-view') {
      // Form reset on navigating to booking
      document.getElementById('patient-details-form').reset();
      document.getElementById('file-name-display').innerText = '';
      this.uploadedFileName = '';
      this.selectedSlot = null;
      this.updateSummary();
      this.renderSlots();

      // Autofill patient details if logged in
      if (this.currentPatient) {
        const nameInput = document.getElementById('patient-name');
        const phoneInput = document.getElementById('patient-phone');
        if (nameInput) nameInput.value = this.currentPatient.name;
        if (phoneInput) phoneInput.value = this.currentPatient.phone;
      }
    }
  }

  startBookingFlow() {
    this.closeMobileMenu();
    if (this.currentPatient) {
      this.navigateTo('booking-view');
    } else {
      alert("Please log in or create an account to proceed with booking.");
      this.navigateTo('patient-portal-view');
    }
  }

  scrollToSection(sectionId) {
    this.navigateTo('landing-view');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }

  toggleMobileMenu() {
    const nav = document.getElementById('nav-links-menu');
    const btn = document.getElementById('mobile-menu-toggle');
    if (nav && btn) {
      nav.classList.toggle('nav-open');
      btn.classList.toggle('active');
    }
  }

  closeMobileMenu() {
    const nav = document.getElementById('nav-links-menu');
    const btn = document.getElementById('mobile-menu-toggle');
    if (nav && btn) {
      nav.classList.remove('nav-open');
      btn.classList.remove('active');
    }
  }

  // 1. SCHEDULER & CALENDAR ENGINE
  generateCalendar() {
    const slider = document.getElementById('date-slider');
    if (!slider) return;
    slider.innerHTML = '';

    const today = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    document.getElementById('calendar-month-year').innerText = `${months[today.getMonth()]} ${today.getFullYear()}`;

    // Generate next 7 days
    for (let i = 0; i < 7; i++) {
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + i);

      const dayName = days[futureDate.getDay()];
      const dayNum = futureDate.getDate();

      const dateCard = document.createElement('div');
      dateCard.className = 'date-card';
      dateCard.dataset.dateStr = futureDate.toDateString();
      dateCard.innerHTML = `
        <span class="day-name">${dayName}</span>
        <span class="day-num">${dayNum}</span>
      `;

      dateCard.addEventListener('click', () => {
        document.querySelectorAll('.date-card').forEach(c => c.classList.remove('active'));
        dateCard.classList.add('active');
        this.selectedDate = new Date(dateCard.dataset.dateStr);
        this.selectedSlot = null; // Reset slot selection
        this.renderSlots();
        this.updateSummary();
      });

      slider.appendChild(dateCard);
    }
  }

  async renderSlots() {
    const grid = document.getElementById('slots-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:1rem; color:var(--neutral-body);">Loading slots...</p>';

    if (!this.doctorProfileId) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:1rem; color:var(--neutral-body);">No doctor profile configured. Please run seeding and refresh.</p>';
      return;
    }

    const pad = (num) => String(num).padStart(2, '0');
    const dateStr = `${this.selectedDate.getFullYear()}-${pad(this.selectedDate.getMonth() + 1)}-${pad(this.selectedDate.getDate())}`;

    try {
      const response = await fetch(`${this.apiBaseUrl}/doctors/${this.doctorProfileId}/availability?date=${dateStr}`);
      const data = await response.json();
      
      grid.innerHTML = '';
      if (!data.success || data.slots.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:2rem; color:var(--neutral-body); background-color:var(--neutral-light); border-radius:var(--border-radius-md);">No availability slots found for this date.</p>';
        return;
      }

      data.slots.forEach(slot => {
        const slotCard = document.createElement('div');
        slotCard.className = 'slot-card';
        slotCard.innerText = slot.label;
        slotCard.dataset.slotId = slot.id;
        
        slotCard.addEventListener('click', () => {
          document.querySelectorAll('.slot-card').forEach(s => s.classList.remove('active'));
          slotCard.classList.add('active');
          this.selectedSlot = { id: slot.id, label: slot.label };
          this.updateSummary();
        });
        
        grid.appendChild(slotCard);
      });
    } catch (err) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:1rem; color:var(--danger);">Error loading slots from server.</p>';
      console.error(err);
    }
  }


  handleFileUpload(input) {
    const display = document.getElementById('file-name-display');
    if (input.files && input.files[0]) {
      this.uploadedFileName = input.files[0].name;
      display.innerText = `Selected: ${this.uploadedFileName}`;
    } else {
      this.uploadedFileName = '';
      display.innerText = '';
    }
  }

  updateSummary() {
    const sDate = document.getElementById('summary-date');
    const sTime = document.getElementById('summary-time');

    if (this.selectedDate) {
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      sDate.innerText = this.selectedDate.toLocaleDateString('en-US', options);
    } else {
      sDate.innerText = 'Select a date';
    }

    if (this.selectedSlot) {
      sTime.innerText = this.selectedSlot.label;
    } else {
      sTime.innerText = 'Select a slot';
    }
  }

  // 2. MOCK RAZORPAY PAYMENT ENGINE
  async openPaymentModal() {
    if (!this.selectedDate || !this.selectedSlot) {
      alert('Please select a date and an available time slot.');
      return;
    }

    const phoneInput = document.getElementById('patient-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      alert('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).');
      if (phoneInput) {
        phoneInput.focus();
        phoneInput.classList.add('input-error');
      }
      return;
    }

    const name = document.getElementById('patient-name').value.trim();
    const age = document.getElementById('patient-age').value.trim();
    const email = document.getElementById('patient-email').value.trim();
    const symptoms = document.getElementById('patient-symptoms').value.trim();

    if (!name || !age || !email || !symptoms) {
      alert('Please fill out all patient information fields.');
      return;
    }

    const token = localStorage.getItem('nh_token');
    if (!token) {
      alert('Your authentication token has expired or you are not logged in. Please log in again.');
      this.navigateTo('patient-portal-view');
      return;
    }

    const checkoutBtn = document.querySelector('#booking-view button.btn-primary');
    const originalText = checkoutBtn ? checkoutBtn.innerText : 'Confirm & Pay Fee';
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.innerText = 'Reserving slot...';
    }

    try {
      // 1. Create Appointment
      const bookRes = await fetch(`${this.apiBaseUrl}/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slotId: this.selectedSlot.id,
          patientName: name,
          patientAge: age,
          patientEmail: email,
          patientPhone: phone,
          symptoms: symptoms
        })
      });

      const bookData = await bookRes.json();
      if (!bookData.success) {
        alert(bookData.message || 'Failed to book slot.');
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.innerText = originalText;
        }
        return;
      }

      const appointmentId = bookData.appointmentId;

      // 2. Upload file if exists
      const fileInput = document.getElementById('patient-reports');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        if (checkoutBtn) checkoutBtn.innerText = 'Uploading report...';
        const formData = new FormData();
        formData.append('report', fileInput.files[0]);

        const uploadRes = await fetch(`${this.apiBaseUrl}/appointments/${appointmentId}/upload-report`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          console.warn('Report upload failed:', uploadData.message);
        }
      }

      // 3. Create Razorpay Order
      if (checkoutBtn) checkoutBtn.innerText = 'Initializing payment...';
      const orderRes = await fetch(`${this.apiBaseUrl}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointmentId })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        alert(orderData.message || 'Failed to initialize payment gateway.');
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.innerText = originalText;
        }
        return;
      }

      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = originalText;
      }

      // 4. Launch Razorpay Checkout widget
      const self = this;
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Neuro Harmony Clinic',
        description: 'Telehealth Neuropsychiatry Consultation',
        order_id: orderData.orderId,
        handler: async function (response) {
          if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.innerText = 'Verifying payment...';
          }

          try {
            const verifyRes = await fetch(`${self.apiBaseUrl}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              // Successfully verified! Redirect to receipt
              self.activeBooking = {
                id: bookData.bookingId,
                patientName: name,
                patientAge: age,
                patientEmail: email,
                patientPhone: phone,
                patientSymptoms: symptoms,
                slotId: self.selectedSlot.id,
                slotLabel: self.selectedSlot.label,
                date: self.selectedDate.toDateString(),
                paymentId: response.razorpay_payment_id
              };

              self.renderBookingConfirmation();
              self.renderPatientDashboard();
            } else {
              alert('Payment verification failed: ' + verifyData.message);
            }
          } catch (verifyErr) {
            console.error(verifyErr);
            alert('Error during signature verification.');
          } finally {
            if (checkoutBtn) {
              checkoutBtn.disabled = false;
              checkoutBtn.innerText = originalText;
            }
          }
        },
        prefill: {
          name: name,
          email: email,
          contact: phone
        },
        theme: {
          color: '#0f766e'
        }
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        alert('Payment failed. Code: ' + response.error.code + '\nReason: ' + response.error.description);
      });
      rzp.open();

    } catch (err) {
      console.error(err);
      alert('Error during booking process. Try again.');
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = originalText;
      }
    }
  }


  renderBookingConfirmation() {
    if (!this.activeBooking) return;

    document.getElementById('receipt-booking-id').innerText = `Booking ID: ${this.activeBooking.id}`;
    document.getElementById('receipt-patient-name').innerText = this.activeBooking.patientName;
    
    const opt = { month: 'short', day: 'numeric', year: 'numeric' };
    const dateFormatted = new Date(this.activeBooking.date).toLocaleDateString('en-US', opt);
    document.getElementById('receipt-slot').innerText = `${dateFormatted}, ${this.activeBooking.slotLabel}`;
    document.getElementById('receipt-payment-id').innerText = this.activeBooking.paymentId;

    this.startCountdownTimer();
    this.navigateTo('confirmation-view');
  }

  startCountdownTimer() {
    const timerDisplay = document.getElementById('countdown-timer');
    if (!timerDisplay) return;

    // Combine booking date and slot time
    const [hours, minutes] = this.activeBooking.slotId.split(':');
    const targetDate = new Date(this.activeBooking.date);
    targetDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const updateTimer = () => {
      const now = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        timerDisplay.innerHTML = `<span style="color:var(--success); font-size:1.5rem;">Your Appointment is Live!</span>`;
        document.getElementById('btn-join-call').classList.remove('btn-secondary');
        document.getElementById('btn-join-call').classList.add('btn-primary');
        clearInterval(this.countdownInterval);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n) => n.toString().padStart(2, '0');

      timerDisplay.innerHTML = `
        <div class="countdown-unit"><span class="num">${pad(h)}</span><span>Hours</span></div> :
        <div class="countdown-unit"><span class="num">${pad(m)}</span><span>Mins</span></div> :
        <div class="countdown-unit"><span class="num">${pad(s)}</span><span>Secs</span></div>
      `;
    };

    updateTimer();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(updateTimer, 1000);
  }

  checkUpcomingBookings() {
    // Look for any scheduled booking in localstorage to display countdown on homepage
    const active = this.bookings.find(b => b.status === 'scheduled');
    if (active) {
      this.activeBooking = active;
    }
  }

  // 3. WEBRTC VIDEO CALL SIMULATOR
  async joinVideoCall(isDoctor = false, bookingId = null) {
    this.userRole = isDoctor ? 'doctor' : 'patient';
    let booking;
    if (isDoctor) {
      booking = this.bookings.find(b => b.id === this.consultingBookingId);
    } else if (bookingId) {
      booking = this.bookings.find(b => b.id === bookingId);
      this.activeBooking = booking;
    } else {
      booking = this.activeBooking;
    }

    if (!booking) {
      alert("No active consultation session found.");
      return;
    }

    this.navigateTo('video-view');
    
    // Set connection details
    document.getElementById('call-connection-type').innerText = `Secure Endpoint ID: ${booking.id}`;
    
    // Set Sidebar patient case details
    document.getElementById('case-patient-name').innerText = booking.patientName;
    document.getElementById('case-patient-age').innerText = `${booking.patientAge} Years`;
    document.getElementById('case-patient-phone').innerText = booking.patientPhone;
    document.getElementById('case-patient-symptoms').innerText = booking.patientSymptoms;
    document.getElementById('case-patient-records').innerText = booking.patientReports || 'No reports uploaded';

    // Show/hide prescription download on sidebar for patient
    const downloadBox = document.getElementById('patient-prescription-download-box');
    if (!isDoctor && booking.prescription) {
      downloadBox.style.display = 'block';
    } else {
      downloadBox.style.display = 'none';
    }

    // Set Stream labels
    if (isDoctor) {
      document.getElementById('remote-user-label').innerText = `${booking.patientName} (Patient)`;
      document.getElementById('remote-status-dot').style.backgroundColor = 'var(--success)';
    } else {
      document.getElementById('remote-user-label').innerText = `Dr. Priyadarshi Srivastava (Neuro Harmony)`;
      document.getElementById('remote-status-dot').style.backgroundColor = 'var(--success)';
    }

    // Setup Video canvases
    this.initVideoCanvases(isDoctor);

    // Setup Chat
    this.initChatSession(isDoctor, booking);

    // Start timer count up
    this.startCallTimer();
  }

  initVideoCanvases(isDoctor) {
    const localCanvas = document.getElementById('local-stream-canvas');
    const remoteCanvas = document.getElementById('remote-stream-canvas');
    
    if (!localCanvas || !remoteCanvas) return;

    // Start drawing mock patient local camera
    this.startLocalCameraSimulation(localCanvas, isDoctor);

    // Start drawing mock doctor remote video stream
    this.startRemoteStreamSimulation(remoteCanvas, isDoctor);
  }

  async startLocalCameraSimulation(canvas, isDoctor) {
    const ctx = canvas.getContext('2d');
    canvas.width = 320;
    canvas.height = 240;
    
    // Attempt real camera feed
    try {
      this.localVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const video = document.createElement('video');
      video.srcObject = this.localVideoStream;
      video.play();
      
      const drawFrame = () => {
        if (this.isCamOff) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        this.localAnimationId = requestAnimationFrame(drawFrame);
      };
      drawFrame();
      document.getElementById('local-avatar').style.display = 'none';
    } catch (err) {
      // Fallback: draw animated placeholder silhouette
      const drawMockLocal = () => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (!this.isCamOff) {
          // Draw silhouette
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.arc(160, 90, 45, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.ellipse(160, 190, 80, 50, 0, Math.PI, 0);
          ctx.fill();

          // Camera Text
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(isDoctor ? 'Doctor (You)' : 'Patient (You)', 160, 220);
        } else {
          // Draw initials
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 64px Outfit';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isDoctor ? 'D' : 'P', 160, 120);
        }
        
        this.localAnimationId = requestAnimationFrame(drawMockLocal);
      };
      drawMockLocal();
    }
  }

  startRemoteStreamSimulation(canvas, isDoctor) {
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    let particleAngle = 0;

    const drawRemote = () => {
      // Draw simulated webcam background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw animated sound waves
      ctx.strokeStyle = 'rgba(15, 118, 110, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      particleAngle += 0.05;
      
      for (let i = 100; i < 540; i++) {
        const y = 240 + Math.sin(i * 0.03 + particleAngle) * 20 * Math.sin(i * 0.005);
        if (i === 100) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();

      // Draw profile placeholder in center
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(320, 200, 60, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.ellipse(320, 320, 110, 70, 0, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      
      const text = isDoctor ? 'Patient Camera Connected' : 'Dr. Priyadarshi Srivastava (Connected)';
      ctx.fillText(text, 320, 390);

      // Add telemetry scan lines & static overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.height; i += 6) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Draw soft pulsing green circle in the corner
      const glowOpacity = 0.3 + Math.abs(Math.sin(particleAngle)) * 0.4;
      ctx.fillStyle = `rgba(16, 185, 129, ${glowOpacity})`;
      ctx.beginPath();
      ctx.arc(30, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(30, 30, 4, 0, Math.PI * 2);
      ctx.fill();

      this.remoteAnimationId = requestAnimationFrame(drawRemote);
    };
    
    drawRemote();
  }

  // Toggles inside video room
  toggleMic() {
    this.isMicMuted = !this.isMicMuted;
    const btn = document.getElementById('btn-toggle-mic');
    
    if (this.isMicMuted) {
      btn.classList.add('active');
      document.getElementById('mic-on-icon').style.display = 'none';
      document.getElementById('mic-off-icon').style.display = 'block';
    } else {
      btn.classList.remove('active');
      document.getElementById('mic-on-icon').style.display = 'block';
      document.getElementById('mic-off-icon').style.display = 'none';
    }

    if (this.localVideoStream) {
      this.localVideoStream.getAudioTracks().forEach(track => track.enabled = !this.isMicMuted);
    }
  }

  toggleCam() {
    this.isCamOff = !this.isCamOff;
    const btn = document.getElementById('btn-toggle-cam');
    
    if (this.isCamOff) {
      btn.classList.add('active');
      document.getElementById('cam-on-icon').style.display = 'none';
      document.getElementById('cam-off-icon').style.display = 'block';
      document.getElementById('local-stream-container').classList.add('camera-off');
    } else {
      btn.classList.remove('active');
      document.getElementById('cam-on-icon').style.display = 'block';
      document.getElementById('cam-off-icon').style.display = 'none';
      document.getElementById('local-stream-container').classList.remove('camera-off');
    }

    if (this.localVideoStream) {
      this.localVideoStream.getVideoTracks().forEach(track => track.enabled = !this.isCamOff);
    }
  }

  startCallTimer() {
    this.callDurationSeconds = 0;
    const display = document.getElementById('call-timer-display');
    
    const pad = (val) => val.toString().padStart(2, '0');
    
    const updateTime = () => {
      this.callDurationSeconds++;
      const m = Math.floor(this.callDurationSeconds / 60);
      const s = this.callDurationSeconds % 60;
      display.innerText = `${pad(m)}:${pad(s)}`;
    };

    if (this.callTimerInterval) clearInterval(this.callTimerInterval);
    this.callTimerInterval = setInterval(updateTime, 1000);
  }

  endConsultation() {
    if (confirm("Are you sure you want to end this consultation call?")) {
      // Stop media streams
      if (this.localVideoStream) {
        this.localVideoStream.getTracks().forEach(track => track.stop());
      }
      
      // Stop animation frames
      if (this.localAnimationId) cancelAnimationFrame(this.localAnimationId);
      if (this.remoteAnimationId) cancelAnimationFrame(this.remoteAnimationId);
      if (this.callTimerInterval) clearInterval(this.callTimerInterval);

      if (this.userRole === 'doctor') {
        alert("Consultation call ended.");
        this.navigateTo('doctor-view');
      } else {
        this.openFeedbackModal();
      }
    }
  }

  // 4. CONSULTATION LIVE CHAT SYSTEM
  initChatSession(isDoctor, booking) {
    this.chatMessages = [];
    const container = document.getElementById('chat-messages-box');
    if (container) container.innerHTML = '';

    // Configure Digital Rx Tab visibility for Doctor
    const prescTab = document.getElementById('tab-presc');
    if (prescTab) {
      prescTab.style.display = isDoctor ? 'block' : 'none';
    }

    // Set default tab to chat
    this.toggleSidebarTab('chat');

    // Reset and initialize sidebar prescription inputs for doctor
    if (isDoctor && booking) {
      const sideName = document.getElementById('presc-side-patient-name');
      const sideDiag = document.getElementById('presc-side-diagnosis');
      const sideAdv = document.getElementById('presc-side-advice');
      
      if (sideName) sideName.innerText = booking.patientName;
      if (sideDiag) sideDiag.value = '';
      if (sideAdv) sideAdv.value = '';
      
      this.activePrescriptionMeds = [];
      this.renderAddedMedsList(true); // sidebar mode
    }

    // System connection logs
    if (!isDoctor) {
      this.addChatBubble('system', `Joining call connection ${booking.id}...`, '00:00');
    } else {
      this.addChatBubble('system', 'Patient joined call.', '00:00');
    }
  }

  addChatBubble(sender, text, timestamp) {
    const box = document.getElementById('chat-messages-box');
    if (!box) return;

    const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const bubble = document.createElement('div');
    if (sender === 'system') {
      bubble.style.textAlign = 'center';
      bubble.style.fontSize = '0.75rem';
      bubble.style.color = '#64748b';
      bubble.style.padding = '0.5rem';
      bubble.innerText = `${text} (${time})`;
    } else {
      bubble.className = `chat-bubble ${sender}`;
      bubble.innerHTML = `
        <p>${text}</p>
        <div class="chat-bubble-meta">
          <span>${sender === 'doctor' ? 'Dr. Priyadarshi' : 'Patient'}</span>
          <span>${time}</span>
        </div>
      `;
    }
    
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
  }

  sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const text = input.value.trim();
    if (!text) return;

    this.addChatBubble(this.userRole, text);
    input.value = '';

    // Doctor Auto Responder (If user role is patient)
    if (this.userRole === 'patient') {
      setTimeout(() => {
        let reply = "Thank you for sharing this. Can you tell me if you have faced similar issues in the past?";
        const lower = text.toLowerCase();
        
        if (lower.includes('headache') || lower.includes('migraine')) {
          reply = "I see. Headaches can often be triggered by stress, irregular sleep, or cervical stiffness. Do you experience nausea or sound sensitivity with it?";
        } else if (lower.includes('anxiety') || lower.includes('fear') || lower.includes('worry')) {
          reply = "Anxiety can produce strong physical symptoms like palpitations or shallow breathing. Let's work together on some relaxation breathing techniques.";
        } else if (lower.includes('sleep') || lower.includes('insomnia') || lower.includes('wake')) {
          reply = "Sleep regulation is central to mental health. How many hours do you manage to get, and do you look at screens before bedtime?";
        } else if (lower.includes('depress') || lower.includes('sad') || lower.includes('mood')) {
          reply = "Low mood can severely impact energy. I will evaluate this carefully. Let's note down these symptom patterns.";
        } else if (lower.includes('reports') || lower.includes('file')) {
          reply = "Excellent. I will review your uploaded medical reports during our call to understand your clinical history.";
        }
        
        this.addChatBubble('doctor', reply);
      }, 2000);
    }
  }

  toggleSidebarTab(tabName) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${tabName}`);
    if (tabEl) tabEl.classList.add('active');

    const chatContent = document.getElementById('chat-tab-content');
    const caseContent = document.getElementById('case-tab-content');
    const prescContent = document.getElementById('presc-tab-content');

    if (chatContent) chatContent.style.display = 'none';
    if (caseContent) caseContent.style.display = 'none';
    if (prescContent) prescContent.style.display = 'none';

    if (tabName === 'chat' && chatContent) {
      chatContent.style.display = 'flex';
    } else if (tabName === 'case' && caseContent) {
      caseContent.style.display = 'block';
    } else if (tabName === 'presc' && prescContent) {
      prescContent.style.display = 'block';
    }
  }

  // 5. DOCTOR PORTAL DASHBOARD LOGIC
  authDoctorDashboard() {
    // Show password popup
    document.getElementById('doctor-auth-overlay').classList.add('active');
    document.getElementById('doctor-passcode').value = '';
    document.getElementById('doctor-passcode').focus();
  }

  closeDoctorAuth() {
    document.getElementById('doctor-auth-overlay').classList.remove('active');
  }

  verifyDoctorPasscode() {
    const code = document.getElementById('doctor-passcode').value;
    if (code === '1234') {
      this.closeDoctorAuth();
      this.navigateTo('doctor-view');
    } else {
      alert('Invalid Passcode. (Hint: Enter "1234" to demo the portal)');
    }
  }

  renderDoctorDashboard() {
    const listContainer = document.getElementById('doctor-appointments-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Filter appointments scheduled or completed
    const validBookings = this.bookings.filter(b => b.status === 'scheduled' || b.status === 'completed');

    if (validBookings.length === 0) {
      listContainer.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:2rem; color:var(--neutral-body);">
            No appointments booked for online consultations.
          </td>
        </tr>
      `;
      return;
    }

    // Sort by date/time slot
    validBookings.forEach(booking => {
      const tr = document.createElement('tr');
      
      const opt = { month: 'short', day: 'numeric' };
      const dateFormatted = new Date(booking.date).toLocaleDateString('en-US', opt);
      
      const statusBadge = booking.status === 'completed' 
        ? `<span class="badge-status completed">Completed</span>`
        : `<span class="badge-status scheduled">Scheduled</span>`;

      // Enable Join / Prescription workspace button
      let actionBtn = '';
      if (booking.status === 'scheduled') {
        actionBtn = `
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.85rem;" onclick="app.startDoctorSession('${booking.id}')">
              Consult
            </button>
          </div>
        `;
      } else {
        actionBtn = `
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.85rem; width:100%;" onclick="app.viewCompletedPrescription('${booking.id}')">
              View Presc.
            </button>
            <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.85rem; width:100%; background-color: rgba(15, 118, 110, 0.1); color: var(--primary-dark); border-color: rgba(15, 118, 110, 0.15);" onclick="app.editCompletedPrescription('${booking.id}')">
              Edit Presc.
            </button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td class="appt-time-cell">${dateFormatted}, ${booking.slotLabel}</td>
        <td>
          <div class="patient-info-cell">
            <span class="name">${booking.patientName} (${booking.patientAge} yrs)</span>
            <span class="contact">${booking.patientPhone} • ${booking.patientEmail}</span>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      `;

      listContainer.appendChild(tr);
    });
  }

  startDoctorSession(bookingId) {
    this.consultingBookingId = bookingId;
    const booking = this.bookings.find(b => b.id === bookingId);
    
    // Unlock Prescription workspace (Dashboard)
    const workspace = document.getElementById('presc-form-box');
    if (workspace) {
      workspace.style.opacity = '1';
      workspace.style.pointerEvents = 'auto';
    }

    // Toggle button visibilities for fresh consultation
    const genBtn = document.getElementById('presc-generate-btn');
    const updBtn = document.getElementById('presc-update-btn');
    if (genBtn) genBtn.style.display = 'block';
    if (updBtn) updBtn.style.display = 'none';
    
    const prescName = document.getElementById('presc-active-patient-name');
    const prescDiag = document.getElementById('presc-diagnosis');
    const prescAdv = document.getElementById('presc-advice');
    if (prescName) prescName.innerText = booking.patientName;
    if (prescDiag) prescDiag.value = '';
    if (prescAdv) prescAdv.value = '';

    // Reset sidebar inputs too
    const sideName = document.getElementById('presc-side-patient-name');
    const sideDiag = document.getElementById('presc-side-diagnosis');
    const sideAdv = document.getElementById('presc-side-advice');
    if (sideName) sideName.innerText = booking.patientName;
    if (sideDiag) sideDiag.value = '';
    if (sideAdv) sideAdv.value = '';
    
    this.activePrescriptionMeds = [];
    this.renderAddedMedsList(false); // Render dashboard list
    this.renderAddedMedsList(true);  // Render sidebar list

    // Directly open video call session for doctor
    this.joinVideoCall(true);
  }

  viewCompletedPrescription(bookingId) {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (booking && booking.prescription) {
      this.renderPrintPrescription(booking);
      this.showPrescriptionPrintModal(false);
    }
  }

  editCompletedPrescription(bookingId) {
    this.consultingBookingId = bookingId;
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return;

    // Load prescription data into the dashboard workspace
    const workspace = document.getElementById('presc-form-box');
    if (workspace) {
      workspace.style.opacity = '1';
      workspace.style.pointerEvents = 'auto';
    }

    // Toggle button visibilities for editing mode
    const genBtn = document.getElementById('presc-generate-btn');
    const updBtn = document.getElementById('presc-update-btn');
    if (genBtn) genBtn.style.display = 'none';
    if (updBtn) updBtn.style.display = 'block';

    const prescName = document.getElementById('presc-active-patient-name');
    const prescDiag = document.getElementById('presc-diagnosis');
    const prescAdv = document.getElementById('presc-advice');
    
    if (prescName) prescName.innerText = booking.patientName;
    if (prescDiag) prescDiag.value = booking.prescription ? booking.prescription.diagnosis : '';
    if (prescAdv) prescAdv.value = booking.prescription ? booking.prescription.advice : '';

    // Load medications list
    this.activePrescriptionMeds = booking.prescription ? [...booking.prescription.medications] : [];
    this.renderAddedMedsList(false); // dashboard mode
    this.renderAddedMedsList(true);  // sidebar mode

    // Scroll to the prescription workspace container so the doctor can start editing
    const workspaceEl = document.querySelector('.prescription-workspace');
    if (workspaceEl) {
      workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  addPrescriptionItem(isSidebar = false) {
    const prefix = isSidebar ? 'presc-side-' : 'presc-';
    const nameEl = document.getElementById(`${prefix}med-name`);
    const dosageEl = document.getElementById(`${prefix}med-dosage`);
    const freqEl = document.getElementById(`${prefix}med-freq`);

    if (!nameEl) return;

    const name = nameEl.value.trim();
    const dosage = dosageEl.value.trim() || 'As directed';
    const freq = freqEl.value.trim() || '1-0-1';

    if (!name) {
      alert("Please enter a medicine name.");
      return;
    }

    this.activePrescriptionMeds.push({ name, dosage, freq });
    
    // Clear inputs
    nameEl.value = '';
    dosageEl.value = '';
    freqEl.value = '';

    // Synchronize both views
    this.renderAddedMedsList(false);
    this.renderAddedMedsList(true);
  }

  deletePrescriptionItem(index, isSidebar = false) {
    this.activePrescriptionMeds.splice(index, 1);
    this.renderAddedMedsList(false);
    this.renderAddedMedsList(true);
  }

  renderAddedMedsList(isSidebar = false) {
    const containerId = isSidebar ? 'presc-side-added-items-list' : 'presc-added-items-list';
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    
    if (isSidebar && this.activePrescriptionMeds.length === 0) {
      container.innerHTML = `<p style="color:var(--neutral-body); font-size:0.8rem; text-align:center; padding: 0.5rem 0; margin: 0;" id="presc-side-empty-hint">No medications added yet.</p>`;
      return;
    }

    this.activePrescriptionMeds.forEach((med, i) => {
      const div = document.createElement('div');
      div.className = 'presc-item-badge';
      div.innerHTML = `
        <div>
          <span class="med-info">${med.name}</span>
          <span class="dosage-frequency">(${med.dosage} — ${med.freq})</span>
        </div>
        <span class="presc-item-delete" onclick="app.deletePrescriptionItem(${i}, ${isSidebar})">&times;</span>
      `;
      container.appendChild(div);
    });
  }

  // 6. PRESCRIPTION GENERATOR & VIEWER
  generatePrescription(isSidebar = false) {
    const prefix = isSidebar ? 'presc-side-' : 'presc-';
    const diagEl = document.getElementById(`${prefix}diagnosis`);
    const advEl = document.getElementById(`${prefix}advice`);

    if (!diagEl) return;

    const diagnosis = diagEl.value.trim();
    const advice = advEl.value.trim() || 'No special advice.';
    
    if (!diagnosis) {
      alert("Please enter a clinical diagnosis notes before generating prescription.");
      return;
    }
    
    if (this.activePrescriptionMeds.length === 0) {
      alert("Please add at least one medication.");
      return;
    }

    const booking = this.bookings.find(b => b.id === this.consultingBookingId);
    if (!booking) return;

    const rxId = booking.prescription ? booking.prescription.rxId : 'RX-' + Math.floor(1000 + Math.random() * 9000) + '-NH';
    const rxDate = booking.prescription ? booking.prescription.date : new Date().toLocaleDateString('en-GB');
    
    booking.prescription = {
      rxId: rxId,
      diagnosis: diagnosis,
      advice: advice,
      medications: [...this.activePrescriptionMeds],
      date: rxDate
    };

    booking.status = 'completed';
    localStorage.setItem('nh_bookings', JSON.stringify(this.bookings));

    this.renderDoctorDashboard();
    this.renderPrintPrescription(booking);
    
    // Close active consultation form block
    const workspace = document.getElementById('presc-form-box');
    if (workspace) {
      workspace.style.opacity = '0.5';
      workspace.style.pointerEvents = 'none';
    }
    
    const sideName = document.getElementById('presc-active-patient-name');
    if (sideName) sideName.innerText = 'Select a patient';

    // Reset button visibilities back to default (Generate mode)
    const genBtn = document.getElementById('presc-generate-btn');
    const updBtn = document.getElementById('presc-update-btn');
    if (genBtn) genBtn.style.display = 'block';
    if (updBtn) updBtn.style.display = 'none';
    
    // Show Printable layout
    this.showPrescriptionPrintModal(true);

    // Sync database with cloud
    this.syncDb();
  }

  renderPrintPrescription(booking) {
    const rx = booking.prescription;
    if (!rx) return;

    document.getElementById('print-patient-name').innerText = booking.patientName;
    document.getElementById('print-patient-age').innerText = `${booking.patientAge} Yrs / Self`;
    document.getElementById('print-date').innerText = rx.date;
    document.getElementById('print-rx-id').innerText = rx.rxId;
    document.getElementById('print-diagnosis').innerText = rx.diagnosis;
    document.getElementById('print-advice').innerText = rx.advice;

    const tbody = document.getElementById('print-meds-table-body');
    tbody.innerHTML = '';

    rx.medications.forEach(med => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rx-med-name">${med.name}</td>
        <td class="rx-med-dosage">${med.dosage}</td>
        <td class="rx-med-freq">${med.freq}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  showPrescriptionPrintModal(wasJustCreated = false) {
    document.getElementById('prescription-print-overlay').classList.add('active');
    this.prescriptionModalCreatedMode = wasJustCreated;
  }

  closePrescriptionPrintModal() {
    document.getElementById('prescription-print-overlay').classList.remove('active');
    
    // If doctor generated it during consultation, close the video consultation overlay
    if (this.prescriptionModalCreatedMode && this.userRole === 'doctor') {
      if (this.localVideoStream) {
        this.localVideoStream.getTracks().forEach(track => track.stop());
      }
      if (this.localAnimationId) cancelAnimationFrame(this.localAnimationId);
      if (this.remoteAnimationId) cancelAnimationFrame(this.remoteAnimationId);
      if (this.callTimerInterval) clearInterval(this.callTimerInterval);
      
      this.navigateTo('doctor-view');
    }
  }

  printPrescription() {
    window.print();
  }

  // MOCK STORAGE PRE-LOAD DATA FOR DEMONSTRATIONS
  getMockBookings() {
    return [
      {
        id: 'NH-293108',
        patientName: 'Sunita Sharma',
        patientAge: '42',
        patientEmail: 'sunita@gmail.com',
        patientPhone: '+91 99123 45678',
        patientSymptoms: 'Difficulty falling asleep, panic attacks in morning and severe mood changes.',
        patientReports: null,
        date: new Date(Date.now() + 86400000).toDateString(), // tomorrow
        slotId: '18:00',
        slotLabel: '06:00 PM',
        paymentId: 'pay_Mock78A12B',
        amount: 700,
        status: 'scheduled',
        prescription: null
      },
      {
        id: 'NH-123405',
        patientName: 'Karan Mehra',
        patientAge: '31',
        patientEmail: 'karan@mehra.org',
        patientPhone: '+91 98989 12345',
        patientSymptoms: 'Chronic stress, tension headache radiating down neck, poor concentration.',
        patientReports: 'mri_cervical_spine.pdf',
        date: new Date(Date.now() - 86400000).toDateString(), // yesterday
        slotId: '17:30',
        slotLabel: '05:30 PM',
        paymentId: 'pay_Mock56Z09P',
        amount: 700,
        status: 'completed',
        prescription: {
          rxId: 'RX-7712-NH',
          diagnosis: 'Cervicogenic Headache with General Stress Syndrome',
          advice: 'Practice shoulder rolls every 2 hours, set blue-light filter on laptops, stay hydrated.',
          medications: [
            { name: 'Tab. Paracetamol', dosage: '650mg', freq: '1-0-1 (after meals)' },
            { name: 'Cap. Pregabalin', dosage: '75mg', freq: '0-0-1 (bedtime)' }
          ],
          date: new Date(Date.now() - 86400000).toLocaleDateString('en-GB')
        }
      }
    ];
  }

  // --- REVIEWS & RATINGS SYSTEM ---
  
  getMockReviews() {
    return [
      {
        name: 'Rahul Verma',
        date: '02 Jul 2026',
        rating: 5,
        comment: 'Excellent virtual consultation! Dr. Priyadarshi was extremely patient and analyzed my insomnia triggers step-by-step. I slept much better following his guidelines.'
      },
      {
        name: 'Priya Sen',
        date: '28 Jun 2026',
        rating: 5,
        comment: 'Highly recommended. His advice for managing work-related anxiety and panic attacks was extremely structured and effective. Very empathetic doctor.'
      },
      {
        name: 'Amit Singh',
        date: '15 Jun 2026',
        rating: 4,
        comment: 'Consulted online for stress-induced tension headaches. The diagnosis was precise, and he suggested quick postural changes that helped reduce the strain.'
      },
      {
        name: 'Meera Nair',
        date: '10 Jun 2026',
        rating: 5,
        comment: 'Superb experience. The Razorpay process was very smooth, and the video quality was crystal clear. The digital prescription was generated instantly.'
      }
    ];
  }

  renderReviews() {
    const grid = document.getElementById('reviews-display-grid');
    const statsContainer = document.getElementById('reviews-stats-summary');
    if (!grid || !statsContainer) return;

    grid.innerHTML = '';

    // Calculate Average Rating
    const totalReviews = this.reviews.length;
    const sumRatings = this.reviews.reduce((acc, curr) => acc + curr.rating, 0);
    const avgRating = totalReviews > 0 ? (sumRatings / totalReviews).toFixed(1) : '5.0';

    // Generate stars visual
    let avgStarsHtml = '';
    const roundedAvg = Math.round(avgRating);
    for (let i = 1; i <= 5; i++) {
      if (i <= roundedAvg) {
        avgStarsHtml += '★';
      } else {
        avgStarsHtml += '☆';
      }
    }

    // Render Stats widget
    statsContainer.innerHTML = `
      <div class="avg-num">${avgRating}</div>
      <div>
        <div class="avg-stars">${avgStarsHtml}</div>
        <div class="total-label">Based on ${totalReviews} verified consultations</div>
      </div>
    `;

    // Render each card
    this.reviews.forEach(review => {
      const card = document.createElement('div');
      card.className = 'review-card';

      // Stars string
      let starsHtml = '';
      for (let i = 1; i <= 5; i++) {
        starsHtml += i <= review.rating ? '★' : '☆';
      }

      // Initial letter for avatar
      const initial = review.name ? review.name.charAt(0) : 'P';

      card.innerHTML = `
        <div class="review-card-header">
          <div class="review-card-user">
            <div class="review-avatar-circle">${initial}</div>
            <div>
              <div class="review-user-name">${review.name}</div>
              <div class="review-card-date">${review.date}</div>
            </div>
          </div>
          <div class="review-card-stars">${starsHtml}</div>
        </div>
        <p class="review-card-comment">"${review.comment}"</p>
      `;

      grid.appendChild(card);
    });
  }

  openFeedbackModal() {
    // Reset modal state
    this.feedbackRating = 5;
    this.setFeedbackRating(5);
    document.getElementById('feedback-comment').value = '';
    document.getElementById('feedback-overlay').classList.add('active');
  }

  closeFeedbackModal() {
    document.getElementById('feedback-overlay').classList.remove('active');
    this.navigateTo('landing-view');
  }

  setFeedbackRating(rating) {
    this.feedbackRating = rating;
    
    // Highlight stars
    const stars = document.querySelectorAll('#feedback-stars span');
    stars.forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });

    // Update text hints
    const hints = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    const hintText = `${hints[rating - 1]} (${rating} Star${rating > 1 ? 's' : ''})`;
    document.getElementById('feedback-rating-hint').innerText = hintText;
  }

  submitFeedback() {
    const comment = document.getElementById('feedback-comment').value.trim();
    const patientName = this.activeBooking ? this.activeBooking.patientName : 'Anonymous Patient';

    const newReview = {
      name: patientName,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      rating: this.feedbackRating,
      comment: comment || 'Very helpful consultation session with Dr. Priyadarshi.'
    };

    // Save and sync
    this.reviews.unshift(newReview); // Add to the top
    localStorage.setItem('nh_reviews', JSON.stringify(this.reviews));
    
    // Render and close
    this.renderReviews();
    this.closeFeedbackModal();
    this.syncDb();
  }

  // --- PATIENT AUTH & ACCOUNT MANAGEMENT PORTAL ---
  
  setPatientAuthTab(tab) {
    this.patientAuthTab = tab;
    
    const loginTabBtn = document.getElementById('btn-patient-login-tab');
    const registerTabBtn = document.getElementById('btn-patient-register-tab');
    const nameGroup = document.getElementById('patient-auth-name-group');

    if (tab === 'login') {
      if (loginTabBtn) loginTabBtn.style.borderBottomColor = 'var(--primary-color)';
      if (registerTabBtn) registerTabBtn.style.borderBottomColor = 'transparent';
      if (nameGroup) nameGroup.style.display = 'none';
    } else {
      if (loginTabBtn) loginTabBtn.style.borderBottomColor = 'transparent';
      if (registerTabBtn) registerTabBtn.style.borderBottomColor = 'var(--primary-color)';
      if (nameGroup) nameGroup.style.display = 'block';
    }
  }

  async sendPatientOTP() {
    const phoneInput = document.getElementById('patient-auth-phone');
    const nameInput = document.getElementById('patient-auth-name');
    
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      alert("Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).");
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (this.patientAuthTab === 'register' && !name) {
      alert("Please enter your full name to create an account.");
      if (nameInput) nameInput.focus();
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Failed to send OTP.');
        return;
      }

      this.patientAuthPhoneInput = phone;
      this.patientAuthNameInput = name;

      alert(`[WhatsApp Simulated SMS]\n\nAn OTP has been printed to the backend console logs. Please enter it here to verify.`);

      const formStep = document.getElementById('patient-auth-form-step');
      const otpStep = document.getElementById('patient-auth-otp-step');
      if (formStep) formStep.style.display = 'none';
      if (otpStep) otpStep.style.display = 'block';
    } catch (err) {
      alert('Error connecting to backend server.');
      console.error(err);
    }
  }

  resetPatientAuthStep() {
    this.patientAuthOTPCode = '';
    const otpInput = document.getElementById('patient-auth-otp');
    if (otpInput) otpInput.value = '';

    const formStep = document.getElementById('patient-auth-form-step');
    const otpStep = document.getElementById('patient-auth-otp-step');
    if (formStep) formStep.style.display = 'block';
    if (otpStep) otpStep.style.display = 'none';
  }

  async verifyPatientOTP() {
    const otpInput = document.getElementById('patient-auth-otp');
    const enteredOTP = otpInput ? otpInput.value.trim() : '';

    if (!enteredOTP) {
      alert("Please enter the 6-digit OTP code.");
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: this.patientAuthPhoneInput, code: enteredOTP, name: this.patientAuthNameInput })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'OTP verification failed.');
        return;
      }

      // Save JWT token
      localStorage.setItem('nh_token', data.token);
      this.currentPatient = {
        name: data.user?.name || this.patientAuthNameInput || 'Patient',
        phone: this.patientAuthPhoneInput
      };
      localStorage.setItem('nh_current_patient', JSON.stringify(this.currentPatient));

      this.resetPatientAuthStep();
      if (otpInput) otpInput.value = '';
      
      const phoneInputEl = document.getElementById('patient-auth-phone');
      const nameInputEl = document.getElementById('patient-auth-name');
      if (phoneInputEl) phoneInputEl.value = '';
      if (nameInputEl) nameInputEl.value = '';

      this.renderPatientDashboard();
    } catch (err) {
      alert('Error connecting to verification server.');
      console.error(err);
    }

    this.syncDb();
  }

  logoutPatient() {
    this.currentPatient = null;
    localStorage.removeItem('nh_current_patient');
    this.renderPatientDashboard();
  }

  async renderPatientDashboard() {
    const authContainer = document.getElementById('patient-auth-container');
    const dashContainer = document.getElementById('patient-dashboard-container');
    
    if (!authContainer || !dashContainer) return;

    if (!this.currentPatient) {
      authContainer.style.display = 'block';
      dashContainer.style.display = 'none';
      this.setPatientAuthTab(this.patientAuthTab);
    } else {
      authContainer.style.display = 'none';
      dashContainer.style.display = 'block';

      document.getElementById('patient-welcome-name').innerText = `Welcome, ${this.currentPatient.name}`;
      document.getElementById('patient-welcome-phone').innerText = `Registered WhatsApp: +91 ${this.currentPatient.phone}`;

      const bookName = document.getElementById('patient-name');
      const bookPhone = document.getElementById('patient-phone');
      if (bookName && !bookName.value) bookName.value = this.currentPatient.name;
      if (bookPhone && !bookPhone.value) bookPhone.value = this.currentPatient.phone;

      const list = document.getElementById('patient-dashboard-bookings-list');
      if (!list) return;
      list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--neutral-body);">Loading appointments...</p>';

      const token = localStorage.getItem('nh_token');
      if (!token) {
        list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--danger);">Authentication expired. Please log out and login again.</p>';
        return;
      }

      try {
        const response = await fetch(`${this.apiBaseUrl}/appointments`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        
        list.innerHTML = '';
        if (!data.success || data.appointments.length === 0) {
          list.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--neutral-body); background-color:var(--neutral-light); border-radius:var(--border-radius-md); border:1px dashed var(--neutral-border);">
              <p style="margin-bottom:1rem;">You don't have any booked appointments yet.</p>
              <button class="btn btn-primary" onclick="app.navigateTo('booking-view')" style="padding:0.5rem 1.25rem; font-size:0.9rem;">Book Consultation Now</button>
            </div>
          `;
          return;
        }

        data.appointments.forEach(booking => {
          const card = document.createElement('div');
          card.style.border = '1px solid var(--neutral-border)';
          card.style.borderRadius = 'var(--border-radius-lg)';
          card.style.padding = '1.5rem';
          card.style.backgroundColor = 'var(--white)';
          card.style.boxShadow = 'var(--shadow-sm)';
          card.style.display = 'flex';
          card.style.flexDirection = 'column';
          card.style.gap = '1rem';
          card.style.marginBottom = '1.5rem';

          const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
          const dateStr = new Date(booking.appointmentDate).toLocaleDateString('en-US', options);

          let statusText = '';
          let statusClass = '';
          if (booking.status === 'PENDING_PAYMENT') {
            statusText = 'Pending Payment';
            statusClass = 'pending';
          } else if (booking.status === 'SCHEDULED') {
            statusText = 'Scheduled';
            statusClass = 'scheduled';
          } else if (booking.status === 'COMPLETED') {
            statusText = 'Completed';
            statusClass = 'completed';
          } else {
            statusText = 'Cancelled';
            statusClass = 'cancelled';
          }

          let actionArea = '';
          if (booking.status === 'PENDING_PAYMENT') {
            actionArea = `
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(0,0,0,0.05);">
                <span style="color:var(--danger); font-size:0.85rem; font-weight:600;">
                  Payment is required to confirm this booking.
                </span>
                <button class="btn btn-primary" style="padding:0.4rem 0.85rem; font-size:0.8rem;" onclick="app.resumeRazorpayCheckout('${booking.id}')">
                  Pay Now
                </button>
              </div>
            `;
          } else if (booking.status === 'SCHEDULED') {
            const todayStr = new Date().toDateString();
            const isToday = new Date(booking.appointmentDate).toDateString() === todayStr;

            if (isToday) {
              actionArea = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(0,0,0,0.05);">
                  <span style="font-weight:700; color:var(--success); display:flex; align-items:center; gap:0.35rem; font-size:0.9rem;">
                    <span class="badge-online" style="position:static; padding:0; width:10px; height:10px; box-shadow:none; display:inline-block;"></span>
                    Consultation Call is Active Today!
                  </span>
                  <button class="btn btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem;" onclick="app.joinVideoCall(false, '${booking.id}')">
                    Join Video Room
                  </button>
                </div>
              `;
            } else {
              actionArea = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(0,0,0,0.05);">
                  <span style="color:var(--neutral-body); font-size:0.85rem; font-weight:600;">
                    Scheduled for ${booking.slotTime}
                  </span>
                  <button class="btn btn-secondary" style="padding:0.4rem 0.85rem; font-size:0.8rem;" disabled>
                    Waiting for Appointment
                  </button>
                </div>
              `;
            }
          } else if (booking.status === 'COMPLETED') {
            if (booking.prescription) {
              actionArea = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(0,0,0,0.05);">
                  <span style="color:var(--primary-dark); font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:0.25rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Prescription Generated
                  </span>
                  <button class="btn btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem; background-color: var(--primary-color); border-color: var(--primary-color);" onclick="app.viewCompletedPrescription('${booking.id}')">
                    Download Prescription
                  </button>
                </div>
              `;
            } else {
              actionArea = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(0,0,0,0.05);">
                  <span style="color:var(--neutral-body); font-size:0.85rem; font-style:italic;">
                    Prescription document pending from doctor.
                  </span>
                </div>
              `;
            }
          }

          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <span class="badge-status ${statusClass}" style="margin-bottom:0.5rem; display:inline-block;">${statusText}</span>
                <h4 style="font-size:1.15rem; color:var(--neutral-dark); margin:0;">Online Video Consultation</h4>
                <p style="font-size:0.85rem; color:var(--neutral-body); margin:0.15rem 0;">Doctor: Dr. Priyadarshi Srivastava</p>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:800; color:var(--primary-dark); font-size:1.1rem;">${dateStr}</div>
                <div style="font-size:0.9rem; font-weight:600; color:var(--neutral-body);">${booking.slotTime}</div>
              </div>
            </div>
            
            <div style="font-size:0.85rem; background-color:var(--neutral-light); border:1px solid var(--neutral-border); padding:0.75rem 1rem; border-radius:var(--border-radius-md);">
              <strong>Consultation Purpose:</strong> ${booking.symptoms}
            </div>
            
            ${actionArea}
          `;

          list.appendChild(card);
        });
      } catch (err) {
        list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--danger);">Error loading your dashboard bookings.</p>';
        console.error(err);
      }
    }
  }
}



// Instantiate App
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new TelehealthApp();
});
