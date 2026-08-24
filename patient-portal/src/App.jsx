import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from './firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_BASE_URL = `${API_URL}/api/v1`;

export default function App() {
  const [view, setView] = useState('landing-view');
  
  // Patient Authentication State
  const [currentPatient, setCurrentPatient] = useState(JSON.parse(localStorage.getItem('nh_current_patient')) || null);
  const [token, setToken] = useState(localStorage.getItem('nh_token') || '');

  // Video Consultation Room State
  const [activeVideoAppt, setActiveVideoAppt] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [socket, setSocket] = useState(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');
  const localVideoRef = useRef(null);
  const jitsiApiRef = useRef(null);

  const leaveVideoRoomSilently = () => {
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('hangup');
      } catch (e) {
        console.error('Error hanging up Jitsi:', e);
      }
    }
    stopMedia();
    setActiveVideoAppt(null);
    fetchPatientAppointments();
  };

  const endPatientConsultation = async () => {
    if (!activeVideoAppt) return;
    if (!window.confirm("Are you sure you want to end the video call? This will mark the appointment as completed on both ends.")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/appointments/${activeVideoAppt.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      const data = await response.json();

      if (data.success) {
        if (socket) {
          socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
        }
        if (jitsiApiRef.current) {
          try {
            jitsiApiRef.current.executeCommand('hangup');
          } catch (e) {
            console.error('Error hanging up Jitsi:', e);
          }
        }
        stopMedia();
        setActiveVideoAppt(null);
        fetchPatientAppointments();
      } else {
        alert(data.message || 'Failed to update appointment status.');
      }
    } catch (err) {
      console.error(err);
      alert('Error ending consultation.');
    }
  };

  useEffect(() => {
    let jitsiApiInstance = null;

    const initJitsi = async () => {
      if (activeVideoAppt) {
        try {
          const res = await fetch(`${API_BASE_URL}/appointments/${activeVideoAppt.id}/jitsi-config`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (data.success) {
            setTimeout(() => {
              const container = document.getElementById('jaas-container');
              if (container) {
                container.innerHTML = '';
                const options = {
                  roomName: data.roomName,
                  width: '100%',
                  height: '100%',
                  parentNode: container,
                  jwt: data.jwt || undefined,
                  userInfo: {
                    displayName: data.displayName,
                    email: data.email
                  },
                  configOverwrite: {
                    startWithAudioMuted: false,
                    startWithVideoMuted: false,
                    prejoinPageEnabled: false
                  },
                  interfaceConfigOverwrite: {
                    // Custom options
                  }
                };
                jitsiApiInstance = new window.JitsiMeetExternalAPI(data.domain, options);
                jitsiApiRef.current = jitsiApiInstance;
                
                jitsiApiInstance.addEventListener('videoConferenceLeft', () => {
                  leaveVideoRoomSilently();
                });
              }
            }, 100);
          } else {
            console.error('Failed to get Jitsi config:', data.message);
          }
        } catch (err) {
          console.error('Error initializing Jitsi:', err);
        }
      }
    };

    initJitsi();

    return () => {
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch (e) {
          console.error('Error disposing Jitsi API:', e);
        }
      }
      jitsiApiRef.current = null;
    };
  }, [activeVideoAppt]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [authTab, setAuthTab] = useState('login'); // 'login' or 'register'
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [regToken, setRegToken] = useState('');
  const [tempPhone, setTempPhone] = useState('');

  // Doctor ID configuration
  const [doctorProfileId, setDoctorProfileId] = useState(null);

  // Booking wizard state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  const [patientDetails, setPatientDetails] = useState({
    name: '',
    age: '',
    email: '',
    phone: '',
    symptoms: ''
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileLabel, setFileLabel] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);

  // Razorpay Checkout Modal Simulator State
  const [showRzpModal, setShowRzpModal] = useState(false);
  const [rzpModalData, setRzpModalData] = useState(null);
  const [rzpMethod, setRzpMethod] = useState('upi'); // 'upi', 'card', 'nb'
  const [rzpProcessing, setRzpProcessing] = useState(false);

  // Confirmation / Receipt View State
  const [activeBooking, setActiveBooking] = useState(null);
  const [patientAppointments, setPatientAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState(null);

  const reviews = [
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

  const totalReviews = reviews.length;
  const sumRatings = reviews.reduce((acc, curr) => acc + curr.rating, 0);
  const avgRating = totalReviews > 0 ? (sumRatings / totalReviews).toFixed(1) : '5.0';

  const getStarsString = (rating) => {
    let stars = '';
    const rounded = Math.round(Number(rating));
    for (let i = 1; i <= 5; i++) {
      stars += i <= rounded ? '★' : '☆';
    }
    return stars;
  };

  // Feedback Modal State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackApptId, setFeedbackApptId] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // Drag and drop state & handlers for file upload
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setFileLabel(`Selected: ${file.name}`);
    }
  };

  // Load doctor profile at startup
  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/doctors`);
        const data = await res.json();
        if (data.success && data.doctors.length > 0) {
          setDoctorProfileId(data.doctors[0].id);
        }
      } catch (err) {
        console.error('Error fetching doctor profile:', err);
      }
    };
    fetchDoctor();
  }, []);

  // Fetch unbooked availability slots whenever selected date or doctor ID changes
  useEffect(() => {
    if (!doctorProfileId) return;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      const pad = (num) => String(num).padStart(2, '0');
      const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
      
      try {
        const res = await fetch(`${API_BASE_URL}/doctors/${doctorProfileId}/availability?date=${dateStr}`);
        const data = await res.json();
        if (data.success) {
          setSlots(data.slots);
        }
      } catch (err) {
        console.error('Error fetching slots:', err);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [selectedDate, doctorProfileId]);

  // Load patient dashboard appointments list whenever token changes
  const fetchPatientAppointments = async () => {
    if (!token) return;
    setLoadingAppts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/appointments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setPatientAppointments(data.appointments);
      }
    } catch (err) {
      console.error('Error loading patient appointments:', err);
    } finally {
      setLoadingAppts(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPatientAppointments();
    }
  }, [token]);

  // Initialize Socket.io instance for patient
  useEffect(() => {
    if (!token) return;

    const socketInstance = io(API_URL, {
      transports: ['websocket']
    });

    socketInstance.on('connect', () => {
      console.log('Patient socket connected:', socketInstance.id);
    });

    socketInstance.on('appointment_updated', (data) => {
      console.log('Real-time appointment_updated event received:', data);
      fetchPatientAppointments();
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  // Video calling media stream handlers & triggers
  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
    } catch (err) {
      console.warn("Camera/Mic permissions denied or unavailable:", err);
      alert("Permission request: Camera and microphone access is required for telemedicine calls.");
    }
  };

  const stopMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeVideoAppt]);

  const toggleCam = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !cameraEnabled;
      });
      setCameraEnabled(!cameraEnabled);
    }
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !micEnabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  // Join room and listen for socket signaling events
  useEffect(() => {
    if (activeVideoAppt && socket) {
      socket.emit('join_consultation', { bookingId: activeVideoAppt.bookingId, role: 'patient' });

      const handleIncomingMessage = (msg) => {
        setChatMessages(prev => [...prev, msg]);
      };

      const handleConsultationEnded = () => {
        alert("The doctor has ended this consultation call. This session is now marked completed.");
        stopMedia();
        setActiveVideoAppt(null);
        fetchPatientAppointments();
      };

      const handlePrescriptionReady = ({ pdfUrl }) => {
        setGeneratedPdfUrl(pdfUrl);
        alert("The doctor has generated a digital prescription! You can now print or download it from the sidebar.");
      };

      socket.on('chat_message', handleIncomingMessage);
      socket.on('consultation_ended', handleConsultationEnded);
      socket.on('prescription_ready', handlePrescriptionReady);

      return () => {
        socket.off('chat_message', handleIncomingMessage);
        socket.off('consultation_ended', handleConsultationEnded);
        socket.off('prescription_ready', handlePrescriptionReady);
      };
    }
  }, [activeVideoAppt, socket]);

  // Submit chat message
  const sendChatMessage = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !socket || !activeVideoAppt) return;

    socket.emit('chat_message', {
      bookingId: activeVideoAppt.bookingId,
      sender: 'patient',
      text: chatInput.trim()
    });
    setChatInput('');
  };

  // Timer counter effect
  useEffect(() => {
    let interval = null;
    if (activeVideoAppt) {
      setTimerSeconds(0);
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [activeVideoAppt]);

  const formatTime = (totalSeconds) => {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Triggers video room entry
  const joinVideoRoom = (appt) => {
    setGeneratedPdfUrl(appt.prescription?.pdfUrl || '');
    setChatMessages([]);
    setChatInput('');
    setCameraEnabled(true);
    setMicEnabled(true);
    setActiveVideoAppt(appt);
    startMedia();
  };

  // Autofill booking details if patient is logged in
  useEffect(() => {
    if (currentPatient) {
      setPatientDetails(prev => ({
        ...prev,
        name: currentPatient.name || '',
        phone: currentPatient.phone || ''
      }));
    }
  }, [currentPatient]);

  // Navigations & scrolls
  const navigateTo = (viewName) => {
    setView(viewName);
    window.scrollTo(0, 0);
  };

  const handleBookingClick = () => {
    if (!token || !currentPatient) {
      setRedirectAfterLogin('booking-view');
      navigateTo('patient-portal-view');
    } else {
      navigateTo('booking-view');
    }
  };

  const scrollToSection = (sectionId) => {
    setView('landing-view');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Auth helper methods
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setOtpError('Please enter a valid 10-digit Indian mobile number.');
      setOtpLoading(false);
      return;
    }

    if (authTab === 'register' && !name) {
      setOtpError('Please enter your full name.');
      setOtpLoading(false);
      return;
    }

    try {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          console.error('Error clearing old recaptcha:', e);
        }
        window.recaptchaVerifier = null;
      }

      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible'
      });
      
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = `+91${phone}`;
      
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      window.confirmationResult = confirmationResult;
      setOtpSent(true);
      alert('A 6-digit verification code has been sent via SMS.');
    } catch (err) {
      setOtpError(err.message || 'Error sending OTP via Firebase.');
      console.error(err);
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch (e) {}
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);

    try {
      if (!window.confirmationResult) {
        setOtpError('No active verification session. Please request a new OTP.');
        setOtpLoading(false);
        return;
      }

      const result = await window.confirmationResult.confirm(otpCode);
      const user = result.user;
      const idToken = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/auth/firebase-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name })
      });
      const data = await res.json();

      if (data.success) {
        if (data.userExists === false) {
          // Verification succeeded, but user registration profile is missing
          setRegToken(data.registrationToken);
          setTempPhone(phone);
          setOtpSent(false);
          setOtpCode('');
          setOtpError('');
          return;
        }

        setToken(data.token);
        const pObj = {
          name: data.user?.name || name || 'Patient',
          phone: phone
        };
        setCurrentPatient(pObj);
        localStorage.setItem('nh_token', data.token);
        localStorage.setItem('nh_current_patient', JSON.stringify(pObj));
        
        // Reset inputs
        setPhone('');
        setName('');
        setOtpCode('');
        setOtpSent(false);
        setRegToken('');
        setTempPhone('');
        if (redirectAfterLogin) {
          setView(redirectAfterLogin);
          setRedirectAfterLogin(null);
        } else {
          setView('patient-portal-view');
        }
      } else {
        setOtpError(data.message || 'OTP verification failed.');
      }
    } catch (err) {
      setOtpError(err.message || 'Error verifying OTP.');
      console.error(err);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);

    if (!name) {
      setOtpError('Please enter your name.');
      setOtpLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, registrationToken: regToken })
      });
      const data = await res.json();

      if (data.success) {
        setToken(data.token);
        const pObj = {
          name: data.user?.name || name,
          phone: tempPhone
        };
        setCurrentPatient(pObj);
        localStorage.setItem('nh_token', data.token);
        localStorage.setItem('nh_current_patient', JSON.stringify(pObj));

        // Reset
        setPhone('');
        setName('');
        setOtpCode('');
        setOtpSent(false);
        setRegToken('');
        setTempPhone('');
        if (redirectAfterLogin) {
          setView(redirectAfterLogin);
          setRedirectAfterLogin(null);
        } else {
          setView('patient-portal-view');
        }
      } else {
        setOtpError(data.message || 'Registration failed.');
      }
    } catch (err) {
      setOtpError('Error completing registration.');
      console.error(err);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setOtpError('');
    setOtpLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const idToken = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/auth/firebase-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await res.json();

      if (data.success) {
        if (data.userExists === false) {
          // Verification succeeded, but user registration profile is missing
          setRegToken(data.registrationToken);
          setTempPhone('');
          setOtpSent(false);
          setOtpCode('');
          setOtpError('');
          return;
        }

        setToken(data.token);
        const pObj = {
          name: data.user?.name || user.displayName || 'Patient',
          phone: data.user?.phone || '',
          email: data.user?.email || user.email || ''
        };
        setCurrentPatient(pObj);
        localStorage.setItem('nh_token', data.token);
        localStorage.setItem('nh_current_patient', JSON.stringify(pObj));
        
        // Reset inputs
        setPhone('');
        setName('');
        setOtpCode('');
        setOtpSent(false);
        setRegToken('');
        setTempPhone('');
        if (redirectAfterLogin) {
          setView(redirectAfterLogin);
          setRedirectAfterLogin(null);
        } else {
          setView('patient-portal-view');
        }
      } else {
        setOtpError(data.message || 'Google login failed on backend.');
      }
    } catch (err) {
      setOtpError(err.message || 'Error signing in with Google.');
      console.error(err);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentPatient(null);
    setToken('');
    setPatientAppointments([]);
    localStorage.removeItem('nh_token');
    localStorage.removeItem('nh_current_patient');
    setView('landing-view');
  };

  // Called when any API returns 401 — clears stale token and redirects to login
  const handleSessionExpired = () => {
    setCurrentPatient(null);
    setToken('');
    setPatientAppointments([]);
    localStorage.removeItem('nh_token');
    localStorage.removeItem('nh_current_patient');
    setBookingLoading(false);
    setView('patient-portal-view');
    setTimeout(() => alert('⚠️ Your session has expired. Please log in again to continue.'), 100);
  };

  // Reserving & Paying for slots
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      alert('Please select an available time slot.');
      return;
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(patientDetails.phone)) {
      alert('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!token) {
      alert('You must log in to the Patient Portal to confirm booking.');
      setView('patient-portal-view');
      return;
    }

    setBookingLoading(true);

    try {
      // 1. Create Appointment
      const bookRes = await fetch(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          patientName: patientDetails.name,
          patientAge: parseInt(patientDetails.age, 10),
          patientEmail: patientDetails.email,
          patientPhone: patientDetails.phone,
          symptoms: patientDetails.symptoms
        })
      });

      const bookData = await bookRes.json();
      if (bookRes.status === 401 || bookData.message?.toLowerCase().includes('invalid') || bookData.message?.toLowerCase().includes('expired')) {
        handleSessionExpired();
        return;
      }
      if (!bookData.success) {
        alert(bookData.message || 'Failed to book slot.');
        setBookingLoading(false);
        return;
      }

      const appointmentId = bookData.appointmentId;
      const finalBookingId = bookData.bookingId;

      // 2. Upload medical report if selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append('report', selectedFile);
        await fetch(`${API_BASE_URL}/appointments/${appointmentId}/upload-report`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      }

      // 3. Create Razorpay Order
      const orderRes = await fetch(`${API_BASE_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointmentId })
      });

      const orderData = await orderRes.json();
      if (orderRes.status === 401 || orderData.message?.toLowerCase().includes('invalid') || orderData.message?.toLowerCase().includes('expired')) {
        handleSessionExpired();
        return;
      }
      if (!orderData.success) {
        alert('Failed to initialize payment. Please try again.');
        setBookingLoading(false);
        return;
      }

      const modalPayload = {
        appointmentId,
        bookingId: finalBookingId,
        orderId: orderData.orderId,
        amount: orderData.amount,
        isResume: false
      };

      const isMockGateway = orderData.isMock || 
                            orderData.orderId?.startsWith('order_mock_') || 
                            orderData.keyId?.includes('your_key_id') || 
                            typeof window.Razorpay === 'undefined';

      if (isMockGateway) {
        setRzpModalData(modalPayload);
        setShowRzpModal(true);
        setBookingLoading(false);
        return;
      }

      // 4. Launch Razorpay Widget
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Neuro Harmony Clinic',
        description: 'Telehealth Neuropsychiatry Consultation',
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
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
              const confirmedObj = {
                id: appointmentId,
                bookingId: finalBookingId,
                patientName: patientDetails.name,
                patientPhone: patientDetails.phone,
                slotTime: selectedSlot.label,
                date: selectedDate.toDateString(),
                videoRoomUrl: `https://meet.jit.si/nh-${finalBookingId.toLowerCase()}`,
                paymentId: response.razorpay_payment_id
              };
              setActiveBooking(confirmedObj);
              setSelectedSlot(null);
              setSelectedFile(null);
              setFileLabel('');
              setPatientDetails({ name: '', age: '', email: '', phone: '', symptoms: '' });
              
              fetchPatientAppointments();
              navigateTo('booking-confirmation-view');
            } else {
              alert('Signature verification failed: ' + verifyData.message);
            }
          } catch (err) {
            console.error(err);
            alert('Error verifying signature.');
          }
        },
        prefill: {
          name: patientDetails.name,
          email: patientDetails.email,
          contact: patientDetails.phone
        },
        theme: {
          color: '#0f766e'
        }
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          console.warn('Razorpay live checkout failed, opening fallback simulator:', resp.error);
          setRzpModalData(modalPayload);
          setShowRzpModal(true);
        });
        rzp.open();
      } catch (rzpErr) {
        console.warn('Razorpay widget error, fallback to simulator:', rzpErr);
        setRzpModalData(modalPayload);
        setShowRzpModal(true);
      }

    } catch (err) {
      alert('Error booking consultation.');
      console.error(err);
    } finally {
      setBookingLoading(false);
    }
  };

  // Handle Simulated Payment Completion
  const handleSimulatedPaymentSuccess = async (modalData) => {
    setRzpProcessing(true);
    try {
      const mockPayId = `pay_mock_${Date.now()}`;
      const mockSig = `sim_sig_${Date.now()}`;

      const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          razorpay_payment_id: mockPayId,
          razorpay_order_id: modalData.orderId,
          razorpay_signature: mockSig
        })
      });

      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        setShowRzpModal(false);
        setRzpProcessing(false);

        if (modalData.isResume) {
          alert('Payment completed successfully!');
          fetchPatientAppointments();
        } else {
          const confirmedObj = {
            id: modalData.appointmentId,
            bookingId: modalData.bookingId,
            patientName: patientDetails.name,
            patientPhone: patientDetails.phone,
            slotTime: selectedSlot ? selectedSlot.label : 'Evening Slot',
            date: selectedDate.toDateString(),
            videoRoomUrl: `https://meet.jit.si/nh-${modalData.bookingId.toLowerCase()}`,
            paymentId: mockPayId
          };
          setActiveBooking(confirmedObj);
          setSelectedSlot(null);
          setSelectedFile(null);
          setFileLabel('');
          setPatientDetails({ name: '', age: '', email: '', phone: '', symptoms: '' });
          fetchPatientAppointments();
          navigateTo('booking-confirmation-view');
        }
      } else {
        alert('Payment verification failed: ' + verifyData.message);
        setRzpProcessing(false);
      }
    } catch (err) {
      console.error('Error verifying simulated payment:', err);
      alert('Error verifying payment.');
      setRzpProcessing(false);
    }
  };

  // Feedback Submission
  const submitFeedback = async (e) => {
    e.preventDefault();
    setFeedbackSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/appointments/${feedbackApptId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rating: feedbackRating,
          comment: feedbackComment
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Thank you! Your feedback has been recorded.');
        setShowFeedbackModal(false);
        setFeedbackComment('');
        fetchPatientAppointments();
      } else {
        alert(data.message || 'Failed to submit feedback.');
      }
    } catch (err) {
      console.error(err);
      alert('Error submitting feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // Resume checkout for a pending dashboard appointment
  const resumePayment = async (apptId) => {
    try {
      const orderRes = await fetch(`${API_BASE_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointmentId: apptId })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        alert('Failed to initialize payment.');
        return;
      }

      const modalPayload = {
        appointmentId: apptId,
        orderId: orderData.orderId,
        amount: orderData.amount,
        isResume: true
      };

      const isMockGateway = orderData.isMock || 
                            orderData.orderId?.startsWith('order_mock_') || 
                            orderData.keyId?.includes('your_key_id') || 
                            typeof window.Razorpay === 'undefined';

      if (isMockGateway) {
        setRzpModalData(modalPayload);
        setShowRzpModal(true);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Neuro Harmony Clinic',
        description: 'Telehealth Neuropsychiatry Consultation',
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
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
              fetchPatientAppointments();
            } else {
              alert('Verification failed: ' + verifyData.message);
            }
          } catch (err) {
            console.error(err);
          }
        },
        theme: {
          color: '#0f766e'
        }
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          console.warn('Razorpay checkout failed, opening fallback simulator:', resp.error);
          setRzpModalData(modalPayload);
          setShowRzpModal(true);
        });
        rzp.open();
      } catch (rzpErr) {
        setRzpModalData(modalPayload);
        setShowRzpModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Generate date card list (Next 7 days)
  const renderDateCards = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      dates.push(d);
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dates.map((d, index) => {
      const isSelected = d.toDateString() === selectedDate.toDateString();
      return (
        <div 
          key={index}
          className={`date-card ${isSelected ? 'active' : ''}`}
          onClick={() => {
            setSelectedDate(d);
            setSelectedSlot(null);
          }}
        >
          <span className="day-name">{days[d.getDay()]}</span>
          <span className="day-num">{d.getDate()}</span>
        </div>
      );
    });
  };

  if (activeVideoAppt) {
    return (
      <div id="video-view" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#0b0f19', color: '#fff' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>Telehealth Session: {activeVideoAppt.bookingId}</h2>
            {activeVideoAppt.patientName && (
              <div style={{ fontSize: '0.82rem', color: '#2dd4bf', fontWeight: 600, marginTop: '0.15rem' }}>
                👤 Patient: {activeVideoAppt.patientName} {activeVideoAppt.patientAge ? `(${activeVideoAppt.patientAge} Yrs)` : ''}
              </div>
            )}
          </div>
          <span className="badge badge-info" style={{ backgroundColor: '#2dd4bf', color: '#0f172a' }}>Connected</span>
        </header>

        {/* Video Consultation Workspace */}
        <div className="video-layout" style={{ flex: 1, padding: '2rem' }}>
          
          {/* Left panel: Video workspace */}
          <div className="video-workspace">
            <div id="jaas-container">
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                Loading secure video room...
              </div>
            </div>

            {/* Controls Bar */}
            <div className="video-controls-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="call-timer">{formatTime(timerSeconds)}</div>
              
              <div className="controls-group">
                <button className="control-btn btn-hangup" onClick={endPatientConsultation} title="End Consultation" style={{ backgroundColor: '#ef4444' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ transform: 'rotate(135deg)' }}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" fill="currentColor"/></svg>
                </button>
              </div>

              <div className="call-info-badge">Secure Telemedicine Call</div>
            </div>
          </div>

          {/* Right panel: Sidebar with Tabs (Chat, Patient Details) */}
          <div className="consultation-sidebar" style={{ width: '100%' }}>
            <div className="sidebar-tab-header">
              <div className="sidebar-tab active">Live Chat</div>
              <div className="sidebar-tab" style={{ cursor: 'default' }}>Consultation Rx</div>
            </div>

            <div className="sidebar-content-area" style={{ backgroundColor: '#1e293b', flex: 1, display: 'flex', flexDirection: 'column' }}>
              
              <div className="chat-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                  {chatMessages.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>No messages sent yet.</p>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`chat-bubble ${msg.sender}`} style={{ marginBottom: '0.5rem' }}>
                        <div>{msg.text}</div>
                        <div className="chat-bubble-meta">
                          <span>{msg.sender === 'doctor' ? 'Doctor' : 'You'}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {generatedPdfUrl && (
                  <div style={{ backgroundColor: 'rgba(45, 212, 191, 0.1)', border: '1px solid #2dd4bf', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
                    <p style={{ color: '#2dd4bf', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>📄 Prescription Generated for {activeVideoAppt.patientName}</p>
                    <a href={generatedPdfUrl.startsWith('http') ? generatedPdfUrl : `${API_URL}${generatedPdfUrl}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', background: '#2dd4bf', color: '#0f172a', textDecoration: 'none', border: 'none', display: 'inline-block', fontWeight: 700 }}>
                      Download {activeVideoAppt.patientName}'s Prescription PDF
                    </a>
                  </div>
                )}

                <form onSubmit={sendChatMessage} className="chat-input-box">
                  <input 
                    type="text" 
                    placeholder="Type message..." 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)}
                  />
                  <button type="submit" className="chat-send-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </form>
              </div>

            </div>
          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="app-container">
      
      {/* Dynamic Header */}
      <header>
        <div className="nav-wrapper">
          <div className="logo" onClick={() => navigateTo('landing-view')}>
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>
            </svg>
            <span>Neuro Harmony</span>
          </div>

          <ul className="nav-links">
            <li><span className={`nav-link ${view === 'landing-view' ? 'active' : ''}`} onClick={() => navigateTo('landing-view')}>Home</span></li>
            <li><span className="nav-link" onClick={() => scrollToSection('treatments')}>Treatments</span></li>
            <li><span className="nav-link" onClick={() => scrollToSection('timings')}>Timings</span></li>
            <li><span className="nav-link" onClick={() => scrollToSection('testimonials')}>Reviews</span></li>
            <li><span className={`nav-link ${view === 'patient-portal-view' ? 'active' : ''}`} onClick={() => navigateTo('patient-portal-view')}>Patient Portal</span></li>
            <li><span className="nav-cta" onClick={handleBookingClick}>Book Consultation</span></li>
          </ul>
        </div>
      </header>

      {/* VIEWPORTS */}
      <main>
        
        {/* 1. LANDING VIEW */}
        {view === 'landing-view' && (
          <section id="landing-view" className="view-section active">
            <div className="container">
              
              {/* Hero Section */}
              <div className="hero-grid">
                <div className="hero-content">
                  <h1>Comprehensive Care for <span>Mind & Brain</span></h1>
                  <p className="hero-subtitle">Experience world-class psychiatric & neurological care from the comfort of your home or at our modern clinic. Led by one of India's most trusted neuropsychiatrists.</p>
                  
                  <div className="hero-cta-group">
                    <button className="btn btn-primary" onClick={handleBookingClick}>Book Online Video Call</button>
                    <button className="btn btn-secondary" onClick={() => scrollToSection('timings')}>View Clinic Hours</button>
                  </div>

                  <div className="hero-stats">
                    <div className="stat-item">
                      <h3>15+</h3>
                      <p>Years Experience</p>
                    </div>
                    <div className="stat-item">
                      <h3>10k+</h3>
                      <p>Happy Patients</p>
                    </div>
                    <div className="stat-item">
                      <h3>4.9★</h3>
                      <p>Patient Rating</p>
                    </div>
                  </div>
                </div>

                <div className="hero-image-wrapper">
                  <div className="doctor-profile-card">
                    <span className="badge-online">Available Online</span>
                    <img src="/doctor-avatar.jpg" alt="Dr. Priyadarshi Srivastava" />
                    <div className="doctor-info-text">
                      <h2>Dr. Priyadarshi Srivastava</h2>
                      <div className="specialization">Leading Neuropsychiatrist in India</div>
                      <div className="qualification">MBBS, DPM, DNB (Neuropsychiatry)</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timings & Schedules Section */}
              <div id="timings" className="timings-section scroll-anchor">
                <div className="section-header-center">
                  <h2>Our Consultations Schedules</h2>
                  <p>Choose between visiting our physical clinic or booking an online video consultation slot from anywhere.</p>
                </div>
                
                <div className="timings-grid">
                  {/* Physical Clinic Card */}
                  <div className="timing-card clinic-hours">
                    <div className="timing-icon-box">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="timing-details">
                      <h3>Physical Clinic Visit</h3>
                      <p className="days">Monday to Saturday</p>
                      <p className="time">11:00 AM - 04:00 PM</p>
                      <span className="note">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        Walk-in appointments at Neuro Harmony Clinic
                      </span>
                    </div>
                  </div>

                  {/* Online Video Consult Card */}
                  <div className="timing-card online-hours">
                    <div className="timing-icon-box">
                      <svg viewBox="0 0 24 24">
                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="timing-details">
                      <h3>Online Video Consultation</h3>
                      <p className="days">Monday to Sunday</p>
                      <p className="time">05:00 PM - 09:00 PM</p>
                      <span className="note">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        Fees: ₹700. Linked with Razorpay secure payments
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Treatments List */}
              <div id="treatments" className="treatments-section scroll-anchor">
                <div className="section-header-center">
                  <h2>Expert Diagnosis & Treatment</h2>
                  <p>Specialized clinical care for a wide range of psychiatric, cognitive, and neuropsychiatric disorders.</p>
                </div>
                
                <div className="treatments-grid">
                  <div className="treatment-card"><span className="dot"></span><h4>Headache & Migraine</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Anxiety & Phobia Disorders</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Insomnia & Sleep Problems</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Anger Outbursts & Impulse Control</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Cervical Spondylosis-related Issues</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>ADHD (Attention Deficit Hyperactivity Disorder)</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Depression & Emotional Struggles</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Relationship & Marital Issues</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Multiple Body Pains linked to Stress</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Addiction (Alcohol, Smoking, Internet, etc.)</h4></div>
                  <div className="treatment-card"><span className="dot"></span><h4>Sexual & Psychosexual Problems</h4></div>
                </div>
              </div>

              {/* Why Choose Us */}
              <div className="choose-section">
                <h2>Why Choose Dr. Priyadarshi Srivastava?</h2>
                <div className="choose-grid">
                  <div className="choose-card">
                    <div className="num">01</div>
                    <h3>Trusted Experience</h3>
                    <p>One of India's leading Neuropsychiatrists with extensive experience in handling complex mental health conditions.</p>
                  </div>
                  <div className="choose-card">
                    <div className="num">02</div>
                    <h3>Holistic Wellness</h3>
                    <p>Integrates biological treatments, lifestyle changes, and cognitive support for sustainable brain and mind healing.</p>
                  </div>
                  <div className="choose-card">
                    <div className="num">03</div>
                    <h3>Confidential & Ethical</h3>
                    <p>Fully compliant with telemedicine ethics and clinical protocols. Your case data is kept completely private and safe.</p>
                  </div>
                </div>
              </div>

              {/* Patient Reviews & Testimonials Section */}
              <div className="reviews-display-section" id="testimonials">
                <div className="section-header-center">
                  <h2>What Our Patients Say</h2>
                  <p>Real feedback from patients who booked online consultations and visited Neuro Harmony Clinic.</p>
                  
                  <div className="reviews-stats-summary" id="reviews-stats-summary">
                    <div className="avg-num">{avgRating}</div>
                    <div>
                      <div className="avg-stars" style={{ color: 'var(--warning)', letterSpacing: '2px' }}>{getStarsString(avgRating)}</div>
                      <div className="total-label">Based on {totalReviews} verified consultations</div>
                    </div>
                  </div>
                </div>
                
                <div className="testimonials-grid" id="reviews-display-grid">
                  {reviews.map((review, idx) => {
                    const initial = review.name ? review.name.charAt(0) : 'P';
                    return (
                      <div className="review-card" key={idx}>
                        <div className="review-card-header">
                          <div className="review-card-user">
                            <div className="review-avatar-circle">{initial}</div>
                            <div>
                              <div className="review-user-name">{review.name}</div>
                              <div className="review-card-date">{review.date}</div>
                            </div>
                          </div>
                          <div className="review-card-stars" style={{ color: 'var(--warning)' }}>{getStarsString(review.rating)}</div>
                        </div>
                        <p className="review-card-comment">"{review.comment}"</p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </section>
        )}

        {/* 2. PATIENT PORTAL VIEW */}
        {view === 'patient-portal-view' && (
          <section className="view-section active">
            <div className="container" style={{ maxWidth: '640px', padding: '3rem 0' }}>
              {!currentPatient ? (
                // OTP AUTHENTICATION SCREEN
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Premium Heading */}
                  <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(15, 118, 110, 0.1)', color: 'var(--primary-color)', marginBottom: '1.25rem' }}>
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--neutral-dark)', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>Patient Portal Login</h2>
                    <p style={{ fontSize: '0.95rem', color: 'var(--neutral-body)', maxWidth: '460px', margin: '0 auto', lineHeight: '1.5' }}>
                      Verify your mobile number via WhatsApp OTP to schedule appointments, join consultations, and access prescriptions.
                    </p>
                  </div>

                  <div className="glass-panel" style={{ padding: '2.5rem', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--neutral-border)', backgroundColor: 'var(--white)' }}>
                    
                    {/* Modern Tab Selector */}
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '30px', padding: '0.35rem', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                      <button 
                        type="button"
                        className="btn"
                        onClick={() => { setAuthTab('login'); setOtpError(''); }} 
                        style={{ 
                          flex: 1, 
                          borderRadius: '30px', 
                          padding: '0.65rem 1rem', 
                          fontSize: '0.9rem', 
                          fontWeight: '700', 
                          background: authTab === 'login' ? 'var(--white)' : 'transparent',
                          color: authTab === 'login' ? 'var(--primary-color)' : '#64748b',
                          boxShadow: authTab === 'login' ? '0 4px 10px rgba(15, 23, 42, 0.05)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.25s ease'
                        }}
                      >
                        Sign In
                      </button>
                      <button 
                        type="button"
                        className="btn"
                        onClick={() => { setAuthTab('register'); setOtpError(''); }}
                        style={{ 
                          flex: 1, 
                          borderRadius: '30px', 
                          padding: '0.65rem 1rem', 
                          fontSize: '0.9rem', 
                          fontWeight: '700', 
                          background: authTab === 'register' ? 'var(--white)' : 'transparent',
                          color: authTab === 'register' ? 'var(--primary-color)' : '#64748b',
                          boxShadow: authTab === 'register' ? '0 4px 10px rgba(15, 23, 42, 0.05)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.25s ease'
                        }}
                      >
                        Register Account
                      </button>
                    </div>

                    {otpError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--danger-light)', border: '1px solid #fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>{otpError}</span>
                      </div>
                    )}

                    {regToken ? (
                      <form onSubmit={handleCompleteRegistration} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', padding: '0.75rem 1rem', borderRadius: '8px', color: '#0369a1', fontSize: '0.875rem' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          <span>OTP Verified! Please enter your name to complete your patient profile.</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--neutral-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Full Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Rahul Verma"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.8rem 1rem', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
                            required
                          />
                        </div>
                        <button type="submit" className="btn btn-primary btn-block" disabled={otpLoading} style={{ padding: '0.85rem 1rem', borderRadius: '10px' }}>
                          {otpLoading ? 'Registering...' : 'Complete Profile & Sign In'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-block" onClick={() => { setRegToken(''); setName(''); }} style={{ padding: '0.85rem 1rem', borderRadius: '10px' }}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <div id="recaptcha-container"></div>
                        {!otpSent ? (
                          <form onSubmit={handleSendOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {authTab === 'register' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--neutral-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Full Name</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Rahul Verma"
                              value={name}
                              onChange={e => setName(e.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.8rem 1rem', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
                              required
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--neutral-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp Mobile Number</label>
                          <input 
                            type="tel" 
                            placeholder="e.g. 9912345678"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.8rem 1rem', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
                            required
                          />
                        </div>

                        <button type="submit" className="btn btn-primary btn-block" disabled={otpLoading} style={{ padding: '0.85rem 1rem', borderRadius: '10px' }}>
                          {otpLoading ? 'Sending...' : 'Send Verification OTP'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--neutral-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enter 6-Digit Verification Code</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 123456"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value)}
                            maxLength={6}
                            style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.8rem 1rem', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s', letterSpacing: '0.1em', textAlign: 'center', fontWeight: '700' }}
                            required
                          />
                        </div>

                        <button type="submit" className="btn btn-primary btn-block" disabled={otpLoading} style={{ padding: '0.85rem 1rem', borderRadius: '10px' }}>
                          {otpLoading ? 'Verifying...' : 'Verify & Sign In'}
                        </button>

                        <button type="button" className="btn btn-secondary btn-block" onClick={() => setOtpSent(false)} style={{ padding: '0.85rem 1rem', borderRadius: '10px' }}>
                          Back
                        </button>
                      </form>
                    )}

                    {!otpSent && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', gap: '1rem' }}>
                          <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>or</span>
                          <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
                        </div>
                        
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-block" 
                          onClick={handleGoogleLogin} 
                          disabled={otpLoading}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '0.75rem', 
                            padding: '0.85rem 1rem', 
                            borderRadius: '10px',
                            fontWeight: '700',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            width: '100%'
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: '0.25rem' }}>
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                          </svg>
                          Sign In with Google
                        </button>
                      </>
                    )}
                  </>
                )}

                    {/* Secure Environment Footer Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9', color: '#64748b', fontSize: '0.8rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>Secure End-to-End Encryption</span>
                    </div>

                  </div>
                </div>
              ) : (
                // PATIENT DASHBOARD SCREEN
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--white)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--neutral-border)', boxShadow: 'var(--shadow-sm)' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.35rem' }}>Welcome, {currentPatient.name}</h3>
                      {currentPatient.phone ? (
                        <p style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>Phone: +91 {currentPatient.phone}</p>
                      ) : (
                        <p style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>Email: {currentPatient.email}</p>
                      )}
                    </div>
                    <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      Logout
                    </button>
                  </div>

                  <h3 style={{ margin: '0.5rem 0 0 0' }}>Your Scheduled Consultations</h3>

                  {loadingAppts ? (
                    <p style={{ textAlign: 'center', color: 'var(--neutral-body)' }}>Loading appointments...</p>
                  ) : patientAppointments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--white)', borderRadius: '12px', border: '1px dashed var(--neutral-border)' }}>
                      <p style={{ color: 'var(--neutral-body)', marginBottom: '1rem' }}>You don't have any booked appointments yet.</p>
                      <button className="btn btn-primary" onClick={handleBookingClick}>Book First Consultation</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {patientAppointments.map(appt => {
                        const dateText = new Date(appt.appointmentDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                        return (
                          <div key={appt.id} style={{ backgroundColor: 'var(--white)', border: '1px solid var(--neutral-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span className={`badge ${appt.status === 'SCHEDULED' ? 'badge-success' : appt.status === 'PENDING_PAYMENT' ? 'badge-warning' : 'badge-info'}`}>
                                    {appt.status}
                                  </span>
                                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', backgroundColor: 'var(--primary-light)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                    ID: {appt.bookingId}
                                  </span>
                                </div>
                                <h4 style={{ margin: '0.35rem 0 0.15rem 0', fontSize: '1.1rem', color: 'var(--neutral-dark)' }}>Online Video Consultation</h4>
                                {appt.patientName && (
                                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e', marginTop: '0.2rem' }}>
                                    👤 Patient: {appt.patientName} {appt.patientAge ? `(${appt.patientAge} Yrs)` : ''}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{appt.slotTime}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>{dateText}</div>
                              </div>
                            </div>

                            <div style={{ fontSize: '0.85rem', backgroundColor: 'var(--neutral-light)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                              <strong>Purpose / Symptoms:</strong> {appt.symptoms}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.75rem' }}>
                              {appt.status === 'PENDING_PAYMENT' && (
                                <>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>Payment required to confirm.</span>
                                  <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => resumePayment(appt.id)}>
                                    Pay Now
                                  </button>
                                </>
                              )}

                              {appt.status === 'SCHEDULED' && (
                                <>
                                  <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>Consultation call active.</span>
                                  <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => joinVideoRoom(appt)}>
                                    Join Video Room
                                  </button>
                                </>
                              )}

                              {appt.status === 'COMPLETED' && (
                                <>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {appt.prescription ? (
                                      <a href={appt.prescription.pdfUrl ? (appt.prescription.pdfUrl.startsWith('http') ? appt.prescription.pdfUrl : `${API_URL}${appt.prescription.pdfUrl}`) : `${API_URL}/uploads/prescriptions/prescription-${appt.bookingId}.pdf`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none' }}>
                                        📥 Prescription PDF
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--neutral-body)', fontStyle: 'italic' }}>Prescription pending.</span>
                                    )}

                                    {!appt.feedback && (
                                      <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                        onClick={() => {
                                          setFeedbackApptId(appt.id);
                                          setFeedbackRating(5);
                                          setFeedbackComment('');
                                          setShowFeedbackModal(true);
                                        }}
                                      >
                                        ⭐ Leave Feedback
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

            </div>
          </section>
        )}

        {/* 3. BOOKING WIZARD VIEW */}
        {view === 'booking-view' && (
          <section id="booking-view" className="view-section active section-padding" style={{ padding: '3rem 0' }}>
            <div className="container">
              
              <div className="section-header-center" style={{ marginBottom: '2rem' }}>
                <h2>Online Appointment Scheduling</h2>
                <p>Schedule your 30-minute private video consultation. Payment of ₹700 is processed securely before booking confirmation.</p>
              </div>

              <form onSubmit={handleBookingSubmit}>
                <div className="wizard-layout">
                  
                  {/* Left column: steps */}
                  <div className="wizard-steps-container">
                    
                    {/* Calendar & Slot Picker */}
                    <div className="card-panel">
                      <div className="card-panel-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Select Consultation Date & Time
                      </div>
                      
                      <div className="scheduler-container">
                        <div className="date-selector-header">
                          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                        </div>
                        
                        <div className="date-slider">
                          {renderDateCards()}
                        </div>

                        <div className="slots-container">
                          <div className="date-selector-header" style={{ marginBottom: '0.75rem' }}>
                            <span style={{ fontWeight: 600 }}>Available Evening Slots (5:00 PM - 9:00 PM)</span>
                          </div>
                          
                          {loadingSlots ? (
                            <p style={{ textAlign: 'center', color: 'var(--neutral-body)' }}>Loading slots...</p>
                          ) : slots.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--neutral-body)', fontStyle: 'italic', padding: '1.5rem 0' }}>No availability found for this day.</p>
                          ) : (
                            <div className="slots-grid">
                              {slots.map(s => {
                                const isSelected = selectedSlot && selectedSlot.id === s.id;
                                return (
                                  <div 
                                    key={s.id}
                                    className={`slot-card ${isSelected ? 'active' : ''}`}
                                    onClick={() => setSelectedSlot(s)}
                                  >
                                    {s.label}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Patient Information Form */}
                    <div className="card-panel">
                      <div className="card-panel-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        Patient Details
                      </div>

                      {!token ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                          <p style={{ color: 'var(--neutral-body)', marginBottom: '1.25rem' }}>Please sign in to your patient account first to complete the slot booking.</p>
                          <button type="button" className="btn btn-primary" onClick={() => { setRedirectAfterLogin('booking-view'); navigateTo('patient-portal-view'); }}>Go to Login</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Patient's Full Name *</label>
                              <input 
                                type="text" 
                                className="form-control"
                                placeholder="Enter full name"
                                value={patientDetails.name}
                                onChange={e => setPatientDetails({ ...patientDetails, name: e.target.value })}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label>Age *</label>
                              <input 
                                type="number" 
                                className="form-control"
                                placeholder="Enter age"
                                min="1"
                                max="120"
                                value={patientDetails.age}
                                onChange={e => setPatientDetails({ ...patientDetails, age: e.target.value })}
                                required
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="form-group">
                              <label>Email Address *</label>
                              <input 
                                type="email" 
                                className="form-control"
                                placeholder="name@example.com"
                                value={patientDetails.email}
                                onChange={e => setPatientDetails({ ...patientDetails, email: e.target.value })}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label>Phone Number (WhatsApp) *</label>
                              <input 
                                type="tel" 
                                className="form-control"
                                placeholder="10-digit mobile number"
                                pattern="[6-9][0-9]{9}"
                                maxLength="10"
                                value={patientDetails.phone}
                                onChange={e => setPatientDetails({ ...patientDetails, phone: e.target.value.replace(/\D/g, '') })}
                                required
                              />
                            </div>
                          </div>

                          <div className="form-group">
                            <label>Brief Description of Symptoms / Consultation Purpose *</label>
                            <textarea 
                              className="form-control"
                              placeholder="Describe symptoms, duration, previous diagnoses, or queries..."
                              rows="4"
                              value={patientDetails.symptoms}
                              onChange={e => setPatientDetails({ ...patientDetails, symptoms: e.target.value })}
                              required
                            />
                          </div>

                          {/* File Upload Box */}
                          <div className="form-group">
                            <label>Upload Medical Reports (PDF, Images - Optional)</label>
                            <div 
                              className={`file-upload-box ${dragActive ? 'drag-active' : ''}`}
                              onDragEnter={handleDrag}
                              onDragOver={handleDrag}
                              onDragLeave={handleDrag}
                              onDrop={handleDrop}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              <p>Drag & drop files here or click to select</p>
                              <input 
                                type="file" 
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={e => {
                                  if (e.target.files && e.target.files[0]) {
                                    setSelectedFile(e.target.files[0]);
                                    setFileLabel(`Selected: ${e.target.files[0].name}`);
                                  }
                                }}
                              />
                              {fileLabel && <div className="file-name-display">{fileLabel}</div>}
                            </div>
                          </div>

                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right column: Sticky Checkout Summary Sidebar */}
                  <div className="booking-sidebar-container">
                    <div className="card-panel summary-card">
                      <div className="card-panel-title">
                        Summary
                      </div>

                      <div className="summary-details-list">
                        <div className="summary-item">
                          <span className="label">Consultant:</span>
                          <span className="val">Dr. Priyadarshi Srivastava</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Type:</span>
                          <span className="val">Online Video Call</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Date:</span>
                          <span className="val">{selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Time:</span>
                          <span className="val">{selectedSlot ? selectedSlot.label : 'Select a slot'}</span>
                        </div>
                        <div className="summary-item total">
                          <span className="label">Consultation Fee:</span>
                          <span className="val">₹700</span>
                        </div>
                      </div>

                      {token ? (
                        <button 
                          type="submit" 
                          className="btn btn-indigo btn-block" 
                          disabled={bookingLoading || !selectedSlot}
                          style={{ gap: '0.6rem' }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          {bookingLoading ? 'Processing Checkout...' : 'Proceed to Payment (₹700)'}
                        </button>
                      ) : (
                        <button 
                          type="button" 
                          className="btn btn-indigo btn-block" 
                          onClick={() => navigateTo('patient-portal-view')}
                        >
                          Sign In to Proceed
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </form>

            </div>
          </section>
        )}

        {/* 4. CONFIRMATION VIEW */}
        {view === 'booking-confirmation-view' && activeBooking && (
          <section className="view-section active">
            <div className="container" style={{ maxWidth: '600px', padding: '3rem 0', textAlign: 'center' }}>
              <div className="form-panel" style={{ padding: '3rem', boxShadow: 'var(--shadow-md)' }}>
                <span style={{ fontSize: '4rem' }}>🎉</span>
                <h2 style={{ color: 'var(--primary)', fontWeight: 800, marginTop: '1rem' }}>Appointment Confirmed!</h2>
                <p style={{ color: 'var(--neutral-body)', fontSize: '0.95rem', margin: '0.5rem 0 2rem 0' }}>Your payment of ₹700 has been verified. A confirmation WhatsApp/Email alert was dispatched.</p>

                <div style={{ textAlign: 'left', backgroundColor: 'var(--neutral-light)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--neutral-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                  <div>Booking ID: <strong>{activeBooking.bookingId}</strong></div>
                  <div>Scheduled Date: <strong>{activeBooking.date}</strong></div>
                  <div>Consultation Slot: <strong>{activeBooking.slotTime}</strong></div>
                  <div>Patient Name: <strong>{activeBooking.patientName}</strong></div>
                  <div>Payment Reference ID: <strong>{activeBooking.paymentId}</strong></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <button 
                    onClick={() => joinVideoRoom(activeBooking)}
                    className="btn btn-primary"
                    style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  >
                    🎥 Join Consultation Video Room
                  </button>
                  
                  <button className="btn btn-secondary" onClick={() => navigateTo('patient-portal-view')}>
                    Go to Patient Dashboard
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-grid">
          <div className="footer-col-about">
            <h3>
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>
              </svg>
              Neuro Harmony
            </h3>
            <p>Neuro Harmony Clinic is a premier medical centre dedicated to the comprehensive study, diagnosis, and treatment of neuropsychiatric conditions. Under Dr. Priyadarshi Srivastava, we deliver compassionate psychiatric care and secure telemedicine consultations to patients nationwide.</p>
          </div>
          <div className="footer-col-links">
            <h4>Quick Links</h4>
            <ul className="footer-links-list">
              <li><span className="footer-link-span" onClick={() => navigateTo('landing-view')} style={{ cursor: 'pointer' }}>Home</span></li>
              <li><span className="footer-link-span" onClick={handleBookingClick} style={{ cursor: 'pointer' }}>Book Appointment</span></li>
              <li><span className="footer-link-span" onClick={() => scrollToSection('treatments')} style={{ cursor: 'pointer' }}>Expertise Areas</span></li>
              <li><span className="footer-link-span" onClick={() => scrollToSection('testimonials')} style={{ cursor: 'pointer' }}>Patient Reviews</span></li>
              <li><span className="footer-link-span" onClick={() => navigateTo('patient-portal-view')} style={{ cursor: 'pointer' }}>Patient Portal (Track Appt)</span></li>
              <li><a href="http://localhost:4000/" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Doctor Portal Login</a></li>
            </ul>
          </div>
          <div className="footer-col-contact">
            <h4>Clinic Location</h4>
            <div className="footer-contact-details">
              <div className="contact-line">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="3"/></svg>
                <span>
                  <a href="https://maps.app.goo.gl/VojakXbyZss2igBX6" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                    Ugf 19, Subash Chandra Bose Complex, opposite charak pathology, Raja Bazar, Chowk, Lucknow, Uttar Pradesh 226003
                  </a>
                </span>
              </div>
              <div className="contact-line" style={{ marginTop: '0.5rem' }}>
                <a href="https://maps.app.goo.gl/VojakXbyZss2igBX6" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', gap: '0.35rem', alignItems: 'center', borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', textDecoration: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary-light)' }}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  View on Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Neuro Harmony Clinic. All rights reserved. Developed for Dr. Priyadarshi Srivastava.</p>
          <p>Telehealth compliance verified • Powered by Razorpay Secure Payments</p>
        </div>
      </footer>

      {/* FEEDBACK MODAL OVERLAY */}
      {showFeedbackModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Consultation Feedback</h3>
              <button className="btn btn-secondary" onClick={() => setShowFeedbackModal(false)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>✕ Close</button>
            </div>

            <form onSubmit={submitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Star Rating Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
                <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>How was your consultation experience?</label>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '2rem', cursor: 'pointer', margin: '0.5rem 0' }}>
                  {[1, 2, 3, 4, 5].map(star => {
                    const active = star <= feedbackRating;
                    return (
                      <span key={star} onClick={() => setFeedbackRating(star)} style={{ color: active ? 'var(--warning)' : '#e2e8f0' }}>
                        ★
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Comment text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Your Comments (Optional)</label>
                <textarea 
                  placeholder="e.g. Excellent doctor, consultation was very smooth."
                  rows="3"
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={feedbackSubmitting}>
                {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* RAZORPAY CHECKOUT MODAL SIMULATOR */}
      {showRzpModal && rzpModalData && (
        <div className="razorpay-overlay active" style={{ display: 'flex' }}>
          <div className="razorpay-modal">
            {/* Header */}
            <div className="rzp-header">
              <div className="rzp-merchant-info">
                <div className="rzp-logo-circle">NH</div>
                <div className="rzp-merchant-name">
                  <h4>Neuro Harmony Clinic</h4>
                  <p>Dr. Priyadarshi Srivastava</p>
                </div>
              </div>
              <div className="rzp-amount-display">
                <span className="amt-label">AMOUNT</span>
                <span className="amt-val">₹{((rzpModalData.amount || 70000) / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Body */}
            <div className="rzp-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="rzp-section-title">Select Payment Method</span>
                <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Test Mode</span>
              </div>

              <div className="rzp-methods">
                {/* UPI Option */}
                <div className={`rzp-method-option ${rzpMethod === 'upi' ? 'active' : ''}`} onClick={() => setRzpMethod('upi')}>
                  <div className="rzp-method-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  </div>
                  <div className="rzp-method-details">
                    <h5>UPI</h5>
                    <p>Google Pay, PhonePe, Paytm, BHIM</p>
                  </div>
                </div>
                {rzpMethod === 'upi' && (
                  <div className="rzp-details-form active">
                    <input type="text" className="form-control" defaultValue="patient@okaxis" placeholder="UPI ID" style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }} />
                  </div>
                )}

                {/* Cards Option */}
                <div className={`rzp-method-option ${rzpMethod === 'card' ? 'active' : ''}`} onClick={() => setRzpMethod('card')}>
                  <div className="rzp-method-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  </div>
                  <div className="rzp-method-details">
                    <h5>Card</h5>
                    <p>Visa, MasterCard, RuPay, Maestro</p>
                  </div>
                </div>
                {rzpMethod === 'card' && (
                  <div className="rzp-details-form active">
                    <div style={{ marginBottom: '0.5rem' }}>
                      <input type="text" className="form-control" defaultValue="4312 •••• •••• 6789" style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input type="text" className="form-control" defaultValue="12/29" style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }} />
                      <input type="password" className="form-control" defaultValue="•••" style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }} />
                    </div>
                  </div>
                )}

                {/* Netbanking Option */}
                <div className={`rzp-method-option ${rzpMethod === 'nb' ? 'active' : ''}`} onClick={() => setRzpMethod('nb')}>
                  <div className="rzp-method-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M5 17V11M9 17V11M13 17V11M17 17V11M2 7l10-5 10 5M4 7h16" fill="none" stroke="currentColor"/></svg>
                  </div>
                  <div className="rzp-method-details">
                    <h5>Netbanking</h5>
                    <p>SBI, HDFC, ICICI, Axis, Kotak</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="rzp-footer">
              <button 
                type="button"
                className="rzp-btn-pay" 
                disabled={rzpProcessing}
                onClick={() => handleSimulatedPaymentSuccess(rzpModalData)}
              >
                {rzpProcessing ? 'Processing Payment...' : `Pay ₹${((rzpModalData.amount || 70000) / 100).toFixed(2)}`}
              </button>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <div className="rzp-secure-badge">
                  <svg viewBox="0 0 24 24"><path d="M12 2C9.24 2 7 4.24 7 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-1V7c0-2.76-2.24-5-5-5zm3 5v3H9V7c0-1.66 1.34-3 3-3s3 1.34 3 3z"/></svg>
                  Secured by Razorpay • Instant Confirmation
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowRzpModal(false)} 
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
