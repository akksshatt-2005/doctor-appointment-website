import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_BASE_URL = `${API_URL}/api/v1`;

const getLocalDateStr = (d = new Date()) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

const formatPrintDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('doc_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('doc_user')) || null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [apptsError, setApptsError] = useState('');

  // Dashboard view toggle and Offline prescription maker state
  const [dashboardView, setDashboardView] = useState('appointments'); // 'appointments' or 'offline-rx'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSearchIndex, setActiveSearchIndex] = useState(null);
  const [offlineRxList, setOfflineRxList] = useState([]);
  const [loadingOfflineRx, setLoadingOfflineRx] = useState(false);
  const [selectedOfflineRxId, setSelectedOfflineRxId] = useState(null);
  
  const [rxSearchQuery, setRxSearchQuery] = useState('');
  const [tempMed, setTempMed] = useState({ name: '', composition: '', dosage: '', frequency: '' });
  const [offlineForm, setOfflineForm] = useState({
    referenceId: '',
    patientName: '',
    patientAge: '',
    patientGender: 'Male',
    patientPhone: '',
    consultDate: getLocalDateStr(),
    diagnosis: '',
    chiefComplaints: '',
    bp: '',
    pulse: '',
    weight: '',
    medications: [],
    advice: '',
    requiredTests: '',
    followUpDate: ''
  });

  const [offlineLayout, setOfflineLayout] = useState({
    pageWidth: 800,  // px
    pageHeight: 1120, // px
    fontSize: 13,   // px
    marginSize: 40,   // px
    rowSpacing: 12,    // px
    useLetterhead: localStorage.getItem('useLetterheadOffline') === 'true'
  });

  // Medicine Inventory State
  const [medicinesList, setMedicinesList] = useState([]);
  const [loadingMedicines, setLoadingMedicines] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('prescriptions'); // 'prescriptions' or 'inventory'
  const [newMedForm, setNewMedForm] = useState({ name: '', composition: '', dosage: '' });
  const [editingMedId, setEditingMedId] = useState(null);
  const [editingMedName, setEditingMedName] = useState('');
  const [editingMedComposition, setEditingMedComposition] = useState('');
  const [editingMedDosage, setEditingMedDosage] = useState('');
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);

  // Socket and Banner state
  const [socketNotification, setSocketNotification] = useState(null);
  const [newBookingsCount, setNewBookingsCount] = useState(0);
  const [socket, setSocket] = useState(null);

  // Modal / Selection State
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [prescriptionForm, setPrescriptionForm] = useState({
    diagnosis: '',
    advice: '',
    medications: [{ name: '', composition: '', dosage: '', frequency: '' }],
    useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
  });
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');

  // Video Consultation Room State
  const [activeVideoAppt, setActiveVideoAppt] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = React.useRef(null);
  const jitsiApiRef = React.useRef(null);

  const endConsultationSilently = () => {
    if (socket && activeVideoAppt) {
      socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
    }
    stopMedia();
    setActiveVideoAppt(null);
    fetchAppointments();
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
                  endConsultationSilently();
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

  // Fetch appointments from API
  const fetchAppointments = async () => {
    if (!token) return;
    setLoadingAppts(true);
    setApptsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setAppointments(data.appointments);
      } else {
        setApptsError(data.message || 'Failed to fetch appointments.');
      }
    } catch (err) {
      setApptsError('Error connecting to backend server.');
      console.error(err);
    } finally {
      setLoadingAppts(false);
    }
  };

  // Fetch offline prescriptions from API
  const fetchOfflinePrescriptions = async () => {
    if (!token) return;
    setLoadingOfflineRx(true);
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setOfflineRxList(data.prescriptions);
      } else {
        console.error('Failed to fetch offline prescriptions:', data.message);
      }
    } catch (err) {
      console.error('Error fetching offline prescriptions:', err);
    } finally {
      setLoadingOfflineRx(false);
    }
  };

  // Fetch next reference ID from API
  const fetchNextReferenceId = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions/next-reference`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setOfflineForm(prev => ({ ...prev, referenceId: data.nextReferenceId }));
      }
    } catch (err) {
      console.error('Failed to fetch next reference ID:', err);
    }
  };

  // Fetch medicines in the doctor's database
  const fetchMedicines = async () => {
    if (!token) return;
    setLoadingMedicines(true);
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setMedicinesList(data.medicines);
      } else {
        console.error('Failed to fetch medicines:', data.message);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
    } finally {
      setLoadingMedicines(false);
    }
  };

  // Add/Save a new medicine to database
  const saveMedicine = async (e) => {
    if (e) e.preventDefault();
    if (!token) return;
    if (!newMedForm.name.trim()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newMedForm.name.trim(),
          composition: newMedForm.composition ? newMedForm.composition.trim() : null,
          dosage: newMedForm.dosage ? newMedForm.dosage.trim() : null
        })
      });
      const data = await response.json();

      if (data.success) {
        setNewMedForm({ name: '', composition: '', dosage: '' });
        fetchMedicines();
      } else {
        alert(data.message || 'Failed to save medicine.');
      }
    } catch (err) {
      alert('Error saving medicine.');
      console.error(err);
    }
  };

  // Update/Edit a medicine (name/spelling, composition, dosage) in database
  const editMedicine = async (medId) => {
    if (!token) return;
    if (!editingMedName.trim()) {
      alert('Medicine name cannot be empty.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines/${medId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingMedName.trim(),
          composition: editingMedComposition ? editingMedComposition.trim() : null,
          dosage: editingMedDosage ? editingMedDosage.trim() : null
        })
      });
      const data = await response.json();

      if (data.success) {
        setEditingMedId(null);
        fetchMedicines();
      } else {
        alert(data.message || 'Failed to update medicine.');
      }
    } catch (err) {
      alert('Error updating medicine.');
      console.error(err);
    }
  };

  // Delete a medicine from database
  const deleteMedicine = async (medId) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this medicine?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines/${medId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        fetchMedicines();
      } else {
        alert(data.message || 'Failed to delete medicine.');
      }
    } catch (err) {
      alert('Error deleting medicine.');
      console.error(err);
    }
  };

  // Save/Submit offline prescription
  const saveOfflinePrescription = async (e) => {
    if (e) e.preventDefault();
    if (!token) return;

    // Proactively add any currently typed tempMed to the list so the doctor doesn't lose it
    let currentMeds = [...(offlineForm.medications || [])];
    if (tempMed.name && tempMed.name.trim()) {
      currentMeds.push({ ...tempMed });
      // Update state for consistency
      setOfflineForm(prev => ({ ...prev, medications: [...(prev.medications || []), { ...tempMed }] }));
      setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    }

    try {
      const body = {
        id: selectedOfflineRxId || undefined,
        ...offlineForm,
        medications: currentMeds,
        ...offlineLayout
      };

      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (data.success) {
        alert(selectedOfflineRxId ? 'Offline prescription updated successfully!' : 'Offline prescription created successfully!');
        setSelectedOfflineRxId(data.prescription.id);
        setOfflineForm(prev => ({ ...prev, referenceId: data.prescription.referenceId || '' }));
        fetchOfflinePrescriptions();
      } else {
        alert(data.message || 'Failed to save offline prescription.');
      }
    } catch (err) {
      alert('Error saving offline prescription.');
      console.error(err);
    }
  };

  // Delete offline prescription
  const deleteOfflinePrescription = async (rxId) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this offline prescription?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions/${rxId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        alert('Offline prescription deleted successfully.');
        if (selectedOfflineRxId === rxId) {
          resetOfflineForm();
        }
        fetchOfflinePrescriptions();
      } else {
        alert(data.message || 'Failed to delete offline prescription.');
      }
    } catch (err) {
      alert('Error deleting offline prescription.');
      console.error(err);
    }
  };

  // Load offline prescription into form and layout
  const loadOfflinePrescription = (rx) => {
    setSelectedOfflineRxId(rx.id);
    setOfflineForm({
      referenceId: rx.referenceId || '',
      patientName: rx.patientName,
      patientAge: rx.patientAge,
      patientGender: rx.patientGender,
      patientPhone: rx.patientPhone || '',
      consultDate: rx.consultDate ? rx.consultDate.split('T')[0] : (rx.createdAt ? rx.createdAt.split('T')[0] : getLocalDateStr()),
      diagnosis: rx.diagnosis,
      chiefComplaints: rx.chiefComplaints || '',
      bp: rx.bp || '',
      pulse: rx.pulse || '',
      weight: rx.weight || '',
      medications: (typeof rx.medications === 'string' ? JSON.parse(rx.medications) : rx.medications) || [],
      advice: rx.advice || '',
      requiredTests: rx.requiredTests || '',
      followUpDate: rx.followUpDate ? rx.followUpDate.split('T')[0] : ''
    });
    setOfflineLayout({
      pageWidth: rx.pageWidth || 800,
      pageHeight: rx.pageHeight || 1120,
      fontSize: rx.fontSize || 13,
      marginSize: rx.marginSize || 40,
      rowSpacing: rx.rowSpacing || 12,
      useLetterhead: rx.useLetterhead !== undefined ? rx.useLetterhead : false
    });
  };

  // Reset/Create fresh offline prescription template
  const resetOfflineForm = () => {
    setSelectedOfflineRxId(null);
    setOfflineForm({
      referenceId: '',
      patientName: '',
      patientAge: '',
      patientGender: 'Male',
      patientPhone: '',
      consultDate: getLocalDateStr(),
      diagnosis: '',
      chiefComplaints: '',
      bp: '',
      pulse: '',
      weight: '',
      medications: [],
      advice: '',
      requiredTests: '',
      followUpDate: ''
    });
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    setOfflineLayout({
      pageWidth: 800,
      pageHeight: 1120,
      fontSize: 13,
      marginSize: 40,
      rowSpacing: 12,
      useLetterhead: localStorage.getItem('useLetterheadOffline') === 'true'
    });
  };

  // Medication handlers for offline prescription form
  const addOfflineMedicationRow = () => {
    setOfflineForm(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', composition: '', dosage: '', frequency: '' }]
    }));
  };

  const removeOfflineMedicationRow = (index) => {
    setOfflineForm(prev => ({
      ...prev,
      medications: (prev.medications || []).filter((_, i) => i !== index)
    }));
  };

  const handleOfflineMedicationChange = (index, field, value) => {
    const updatedMeds = [...offlineForm.medications];
    updatedMeds[index][field] = value;
    setOfflineForm(prev => ({
      ...prev,
      medications: updatedMeds
    }));
  };

  // Socket.io real-time events listener
  useEffect(() => {
    if (!token) return;

    fetchAppointments();
    fetchOfflinePrescriptions();
    fetchMedicines();

    const socketInstance = io(API_URL, {
      transports: ['websocket']
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected to backend:', socketInstance.id);
    });

    socketInstance.on('booking_confirmed', (data) => {
      console.log('WebSocket booking_confirmed event received:', data);
      setSocketNotification(data);
      setNewBookingsCount(prev => prev + 1);
      fetchAppointments();
    });

    socketInstance.on('appointment_updated', (data) => {
      console.log('Real-time appointment_updated event received:', data);
      fetchAppointments();
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (dashboardView === 'offline-rx' && !selectedOfflineRxId) {
      fetchNextReferenceId();
    }
  }, [dashboardView, selectedOfflineRxId, token]);

  // Video calling media stream handlers & triggers
  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
    } catch (err) {
      console.warn("Camera/Mic permissions denied or unavailable:", err);
      alert("Permission request: Camera and microphone access is required for telehealth video calls.");
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

  // Join socket.io consultation room
  useEffect(() => {
    if (activeVideoAppt && socket) {
      socket.emit('join_consultation', { bookingId: activeVideoAppt.bookingId, role: 'doctor' });

      const handleIncomingMessage = (msg) => {
        setChatMessages(prev => [...prev, msg]);
      };

      socket.on('chat_message', handleIncomingMessage);

      return () => {
        socket.off('chat_message', handleIncomingMessage);
      };
    }
  }, [activeVideoAppt, socket]);

  // Chat submit handler
  const sendChatMessage = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !socket || !activeVideoAppt) return;

    socket.emit('chat_message', {
      bookingId: activeVideoAppt.bookingId,
      sender: 'doctor',
      text: chatInput.trim()
    });
    setChatInput('');
  };

  // Active call timer
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

  // End Video Call & mark completed on both ends
  const endConsultation = async () => {
    if (!activeVideoAppt) return;
    if (!window.confirm("Are you sure you want to end the video call? This will mark the appointment as completed on both ends.")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${activeVideoAppt.id}/status`, {
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
        fetchAppointments();
      } else {
        alert(data.message || 'Failed to update appointment status.');
      }
    } catch (err) {
      console.error(err);
      alert('Error ending consultation call.');
    }
  };

  // Handle email/password login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('doc_token', data.token);
        localStorage.setItem('doc_user', JSON.stringify(data.user));
      } else {
        setLoginError(data.message || 'Invalid email or password.');
      }
    } catch (err) {
      setLoginError('Error connecting to authentication server.');
      console.error(err);
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('doc_token');
    localStorage.removeItem('doc_user');
  };

  // Update appointment status (COMPLETED, CANCELLED, NO_SHOW)
  const updateStatus = async (appointmentId, newStatus) => {
    if (!window.confirm(`Are you sure you want to mark this appointment as ${newStatus}?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Status updated successfully.`);
        fetchAppointments();
        if (selectedAppt && selectedAppt.id === appointmentId) {
          setSelectedAppt(null);
        }
      } else {
        alert(data.message || 'Failed to update status.');
      }
    } catch (err) {
      alert('Error updating status.');
      console.error(err);
    }
  };

  // Prescription Medications Table Helpers
  const addMedicationRow = () => {
    setPrescriptionForm(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', composition: '', dosage: '', frequency: '' }]
    }));
  };

  const removeMedicationRow = (index) => {
    if (prescriptionForm.medications.length === 1) return;
    setPrescriptionForm(prev => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index)
    }));
  };

  const handleMedicationChange = (index, field, value) => {
    const updatedMeds = [...prescriptionForm.medications];
    updatedMeds[index][field] = value;
    setPrescriptionForm(prev => ({
      ...prev,
      medications: updatedMeds
    }));
  };

  // Submit Prescription Form
  const submitPrescription = async (e) => {
    e.preventDefault();
    if (!selectedAppt) return;
    setPrescriptionSubmitting(true);
    setGeneratedPdfUrl('');

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${selectedAppt.id}/prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          diagnosis: prescriptionForm.diagnosis,
          advice: prescriptionForm.advice,
          medications: prescriptionForm.medications,
          useLetterhead: prescriptionForm.useLetterhead
        })
      });

      const data = await response.json();
      if (data.success) {
        setGeneratedPdfUrl(data.pdfUrl);

        // Notify patient about prescription
        if (socket && activeVideoAppt) {
          socket.emit('prescription_posted', { bookingId: activeVideoAppt.bookingId, pdfUrl: data.pdfUrl });
        }

        // Auto mark appointment status as COMPLETED
        try {
          const statusRes = await fetch(`${API_BASE_URL}/doctor/appointments/${selectedAppt.id}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'COMPLETED' })
          });
          const statusData = await statusRes.json();
          if (statusData.success) {
            // Notify patient that consultation has ended
            if (socket && activeVideoAppt) {
              socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
            }
            // Disconnect Jitsi
            if (jitsiApiRef.current) {
              try {
                jitsiApiRef.current.executeCommand('hangup');
              } catch (e) {
                console.error('Error hanging up Jitsi:', e);
              }
            }
            alert('Prescription submitted! Meeting ended and marked completed.');
            stopMedia();
            setActiveVideoAppt(null);
            fetchAppointments();
          } else {
            alert('Prescription submitted, but failed to mark appointment as completed: ' + (statusData.message || ''));
          }
        } catch (statusErr) {
          console.error(statusErr);
          alert('Prescription submitted, but error marking appointment as completed.');
        }
      } else {
        alert(data.message || 'Failed to submit prescription.');
      }
    } catch (err) {
      alert('Error submitting prescription.');
      console.error(err);
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  // Categorize appointments into Today's vs Upcoming (timezone-agnostic calendar date comparison)
  const getUtcDateStr = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };



  const todayStr = getLocalDateStr(new Date());
  const todayAppointments = appointments.filter(appt => getUtcDateStr(appt.appointmentDate) === todayStr);
  const upcomingAppointments = appointments.filter(appt => getUtcDateStr(appt.appointmentDate) !== todayStr);

  if (!token) {
    // LOGIN SCREEN
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Neuro Harmony</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--neutral-body)', marginTop: '0.25rem' }}>Doctor Dashboard Portal</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {loginError && (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', color: 'var(--danger)', fontSize: '0.875rem', textAlign: 'center' }}>
                {loginError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Doctor Email</label>
              <input 
                type="email" 
                placeholder="e.g. doctor@neuroharmony.in"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Secure Password</label>
              <input 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loginLoading}>
              {loginLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeVideoAppt) {
    return (
      <div id="video-view" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#0b0f19' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>Consultation Room: {activeVideoAppt.bookingId}</h2>
          <span className="badge badge-info" style={{ backgroundColor: '#2dd4bf', color: '#0f172a' }}>Active Telehealth Session</span>
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
                <button className="control-btn btn-hangup" onClick={endConsultation} title="End Consultation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ transform: 'rotate(135deg)' }}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" fill="currentColor"/></svg>
                </button>
              </div>

              <div className="call-info-badge">Secure Telehealth Session</div>
            </div>
          </div>

          {/* Right panel: Sidebar with Tabs (Chat, Patient Details, Prescription Form) */}
          <div className="consultation-sidebar">
            <div className="sidebar-tab-header">
              <div className={`sidebar-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Live Chat</div>
              <div className={`sidebar-tab ${activeTab === 'case' ? 'active' : ''}`} onClick={() => setActiveTab('case')}>Patient File</div>
              <div className={`sidebar-tab ${activeTab === 'presc' ? 'active' : ''}`} onClick={() => setActiveTab('presc')}>Digital Rx</div>
            </div>

            <div className="sidebar-content-area" style={{ backgroundColor: '#1e293b' }}>
              
              {/* Tab 1: Live Chat */}
              {activeTab === 'chat' && (
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>No messages sent yet.</p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div key={idx} className={`chat-bubble ${msg.sender}`} style={{ marginBottom: '0.5rem' }}>
                          <div>{msg.text}</div>
                          <div className="chat-bubble-meta">
                            <span>{msg.sender === 'doctor' ? 'You' : 'Patient'}</span>
                            <span>{msg.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
              )}

              {/* Tab 2: Patient File Details */}
              {activeTab === 'case' && (
                <div className="case-details-tab-content">
                  <div className="case-details-section">
                    <h4>Patient Profile</h4>
                    <div className="patient-meta" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div className="meta-row"><span className="lbl">Name:</span><span className="val">{activeVideoAppt.patientName}</span></div>
                      <div className="meta-row"><span className="lbl">Age:</span><span className="val">{activeVideoAppt.patientAge} Years</span></div>
                      <div className="meta-row"><span className="lbl">Phone:</span><span className="val">+91 {activeVideoAppt.patientPhone}</span></div>
                    </div>
                  </div>

                  <div className="case-details-section">
                    <h4>Symptoms / Concern</h4>
                    <p style={{ color: '#94a3b8' }}>{activeVideoAppt.symptoms || 'No complaints reported.'}</p>
                  </div>

                  <div className="case-details-section">
                    <h4>Attached Records</h4>
                    {activeVideoAppt.reportFilePath ? (
                      <a href={`${API_URL}${activeVideoAppt.reportFilePath}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-block" style={{ fontSize: '0.8rem', padding: '0.4rem', background: '#334155', color: '#fff', border: 'none', textDecoration: 'none', display: 'block', textAlign: 'center', borderRadius: '4px' }}>
                        📄 View Medical Report
                      </a>
                    ) : (
                      <p style={{ color: '#94a3b8' }}>No records uploaded.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Digital Prescription (Rx Form) */}
              {activeTab === 'presc' && (
                <div className="prescription-form-box" style={{ color: '#fff' }}>
                  
                  {generatedPdfUrl ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                      <span style={{ fontSize: '3rem' }}>🎉</span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '1rem 0' }}>Prescription Document Generated!</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <a href={generatedPdfUrl.startsWith('http') ? generatedPdfUrl : `${API_URL}${generatedPdfUrl}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                          🖨️ View/Print Prescription PDF
                        </a>
                        <button type="button" className="btn btn-secondary btn-block" onClick={() => setGeneratedPdfUrl('')}>
                          Rewrite / Edit Prescription
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={submitPrescription} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>Clinical Diagnosis Notes</label>
                        <textarea 
                          className="form-control"
                          placeholder="e.g. Anxiety, Insomnia"
                          rows="2"
                          value={prescriptionForm.diagnosis}
                          onChange={e => setPrescriptionForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                          required
                          style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Prescribe Medications</span>
                          <button type="button" onClick={addMedicationRow} style={{ background: '#ffffff', color: '#0f172a', fontWeight: '700', borderRadius: '20px', padding: '0.2rem 0.6rem', border: 'none', fontSize: '0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            + Add Item
                          </button>
                        </label>

                        {prescriptionForm.medications.map((med, index) => (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 32px', gap: '0.35rem', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              placeholder="Med"
                              value={med.name}
                              onChange={e => handleMedicationChange(index, 'name', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <input 
                              type="text" 
                              placeholder="Dose"
                              value={med.dosage}
                              onChange={e => handleMedicationChange(index, 'dosage', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <input 
                              type="text" 
                              placeholder="Freq"
                              value={med.frequency}
                              onChange={e => handleMedicationChange(index, 'frequency', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <button 
                              type="button" 
                              onClick={() => removeMedicationRow(index)}
                              disabled={prescriptionForm.medications.length === 1}
                              style={{ 
                                background: '#ef4444', 
                                border: 'none', 
                                borderRadius: '6px', 
                                color: '#fff', 
                                height: '32px', 
                                width: '32px', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>Instructions / Advice</label>
                        <textarea 
                          className="form-control"
                          placeholder="Instructions advice..."
                          rows="2"
                          value={prescriptionForm.advice}
                          onChange={e => setPrescriptionForm(prev => ({ ...prev, advice: e.target.value }))}
                          style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0.5rem 0' }}>
                        <input 
                          type="checkbox"
                          id="use-letterhead-online"
                          checked={prescriptionForm.useLetterhead}
                          onChange={e => {
                            const val = e.target.checked;
                            localStorage.setItem('useLetterheadOnline', val ? 'true' : 'false');
                            setPrescriptionForm(prev => ({ ...prev, useLetterhead: val }));
                          }}
                          style={{ cursor: 'pointer', width: 'auto' }}
                        />
                        <label htmlFor="use-letterhead-online" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                          Print on Pre-printed Letterhead (2.75" Header, 1.75" Footer)
                        </label>
                      </div>

                      <button type="submit" style={{ background: '#0f766e', border: 'none', borderRadius: '8px', padding: '0.75rem 1rem', fontWeight: '600', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', width: '100%', transition: 'background-color 0.15s ease' }} disabled={prescriptionSubmitting}>
                        {prescriptionSubmitting ? 'Posting Rx...' : 'Sign & Submit Prescription'}
                      </button>

                    </form>
                  )}

                </div>
              )}

            </div>
          </div>

        </div>

      </div>
    );
  }

  // CORE DASHBOARD
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      
      {/* Top Header */}
      <header className="no-print" style={{ backgroundColor: 'var(--white)', borderBottom: '1px solid var(--neutral-border)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>Neuro Harmony Clinic</h1>
            <span className="badge badge-info" style={{ fontWeight: 600 }}>Doctor Portal</span>
          </div>
          <nav style={{ display: 'flex', gap: '0.5rem', borderLeft: '1px solid var(--neutral-border)', paddingLeft: '1.5rem' }}>
            <button 
              className="btn" 
              onClick={() => setDashboardView('appointments')}
              style={{ 
                padding: '0.4rem 0.85rem', 
                fontSize: '0.875rem', 
                fontWeight: 600,
                backgroundColor: dashboardView === 'appointments' ? 'var(--primary-light)' : 'transparent',
                color: dashboardView === 'appointments' ? 'var(--primary)' : 'var(--neutral-body)',
                border: dashboardView === 'appointments' ? '1px solid var(--primary)' : '1px solid transparent'
              }}
            >
              🗓️ Telehealth Grid
            </button>
            <button 
              className="btn" 
              onClick={() => setDashboardView('offline-rx')}
              style={{ 
                padding: '0.4rem 0.85rem', 
                fontSize: '0.875rem', 
                fontWeight: 600,
                backgroundColor: dashboardView === 'offline-rx' ? 'var(--primary-light)' : 'transparent',
                color: dashboardView === 'offline-rx' ? 'var(--primary)' : 'var(--neutral-body)',
                border: dashboardView === 'offline-rx' ? '1px solid var(--primary)' : '1px solid transparent'
              }}
            >
              📝 Offline Rx Maker
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{user?.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-body)' }}>{user?.email}</div>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Socket Toast Banner */}
      {socketNotification && (
        <div className="glass-panel no-print" style={{ margin: '1rem 2rem 0 2rem', padding: '1rem 1.5rem', borderLeft: '4px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'pulse 2s infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🔔</span>
            <div>
              <strong style={{ color: 'var(--primary)' }}>Real-Time Alert: New Consultation Booked!</strong>
              <div style={{ fontSize: '0.875rem', color: 'var(--neutral-dark)', marginTop: '0.15rem' }}>
                {socketNotification.patientName} has scheduled a slot for {socketNotification.slotTime} ({socketNotification.date})
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setSocketNotification(null)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
            Acknowledge
          </button>
        </div>
      )}

      {/* Main Container */}
      <main style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        
        {dashboardView === 'appointments' && (
          <>
            {/* Statistics section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>TODAY'S SCHEDULE</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{todayAppointments.length}</div>
                </div>
                <span style={{ fontSize: '2.5rem' }}>📅</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>UPCOMING SESSIONS</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{upcomingAppointments.length}</div>
                </div>
                <span style={{ fontSize: '2.5rem' }}>⏳</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>LIVE INCOMING BADGES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: newBookingsCount > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
                    {newBookingsCount}
                  </div>
                </div>
                <span style={{ fontSize: '2.5rem', animation: newBookingsCount > 0 ? 'bounce 1s infinite' : 'none' }}>⚡</span>
              </div>
            </div>

            {/* Dynamic Appointments List */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Today's Schedule Card */}
              <div className="glass-panel" style={{ padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>Today's Scheduled Consultations</h3>
                  <button className="btn btn-secondary" onClick={fetchAppointments} style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }} disabled={loadingAppts}>
                    {loadingAppts ? 'Reloading...' : '↻ Refresh Grid'}
                  </button>
                </div>

                {loadingAppts && appointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem' }}>Loading schedule...</p>
                ) : apptsError ? (
                  <p style={{ textAlign: 'center', color: 'var(--danger)', padding: '2rem' }}>{apptsError}</p>
                ) : todayAppointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem', fontStyle: 'italic' }}>No consultations scheduled for today.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {todayAppointments.map(appt => (
                      <AppointmentCard 
                        key={appt.id} 
                        appt={appt} 
                        onStatusChange={updateStatus} 
                        onJoinVideoCall={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                          setActiveVideoAppt(appt);
                          startMedia();
                        }}
                        onWritePrescription={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Schedule Card */}
              <div className="glass-panel" style={{ padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>Upcoming Schedule</h3>

                {upcomingAppointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem', fontStyle: 'italic' }}>No upcoming consultations found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {upcomingAppointments.map(appt => (
                      <AppointmentCard 
                        key={appt.id} 
                        appt={appt} 
                        onStatusChange={updateStatus} 
                        onWritePrescription={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}

        {dashboardView === 'offline-rx' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Toggle Sidebar Button (Hamburger Menu) */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center' }}>
              <button 
                type="button"
                onClick={() => setSidebarOpen(prev => !prev)}
                style={{
                  background: sidebarOpen ? 'var(--neutral-light)' : 'var(--primary)',
                  color: sidebarOpen ? 'var(--primary)' : 'var(--white)',
                  border: '1px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease',
                  outline: 'none'
                }}
              >
                <span>☰</span> {sidebarOpen ? 'Hide Database & Saved Rx' : 'Show Database & Saved Rx'}
              </button>
            </div>

            <div className="offline-rx-workspace" style={{ display: 'grid', gridTemplateColumns: sidebarOpen ? '280px 1fr' : '1fr', gap: '2rem', alignItems: 'start' }}>
              
              {/* Left Sidebar: Tabs for Prescriptions and Medicines */}
              {sidebarOpen && (
                <div className="glass-panel no-print" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
              
              {/* Tab Header Selector */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--neutral-border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                <button 
                  type="button"
                  onClick={() => setActiveSidebarTab('prescriptions')}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    padding: '0.4rem 0',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: activeSidebarTab === 'prescriptions' ? 'var(--primary)' : 'var(--neutral-body)',
                    borderBottom: activeSidebarTab === 'prescriptions' ? '2px solid var(--primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  📁 Saved Rx
                </button>
                <button 
                  type="button"
                  onClick={() => setActiveSidebarTab('inventory')}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    padding: '0.4rem 0',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: activeSidebarTab === 'inventory' ? 'var(--primary)' : 'var(--neutral-body)',
                    borderBottom: activeSidebarTab === 'inventory' ? '2px solid var(--primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  💊 Medicine DB
                </button>
              </div>

              {activeSidebarTab === 'prescriptions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <button className="btn btn-primary" onClick={resetOfflineForm} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%' }}>
                    ➕ New Prescription
                  </button>

                  <input 
                    type="text"
                    placeholder="🔍 Search by Ref ID, Name..."
                    value={rxSearchQuery}
                    onChange={e => setRxSearchQuery(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--neutral-border)',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                  />
                  
                  {loadingOfflineRx ? (
                    <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--neutral-body)', textAlign: 'center', padding: '1rem 0' }}>Loading past Rx...</p>
                  ) : offlineRxList.length === 0 ? (
                    <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--neutral-body)', textAlign: 'center', padding: '1rem 0' }}>No saved prescriptions.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {offlineRxList.filter(rx => {
                        const q = rxSearchQuery.toLowerCase();
                        return (
                          rx.patientName.toLowerCase().includes(q) ||
                          (rx.referenceId && rx.referenceId.toLowerCase().includes(q)) ||
                          rx.id.toLowerCase().includes(q)
                        );
                      }).map(rx => (
                        <div 
                          key={rx.id} 
                          onClick={() => loadOfflinePrescription(rx)}
                          style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '8px', 
                            border: selectedOfflineRxId === rx.id ? '2px solid var(--primary)' : '1px solid var(--neutral-border)',
                            backgroundColor: selectedOfflineRxId === rx.id ? 'var(--primary-light)' : 'var(--white)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            position: 'relative'
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--neutral-dark)', paddingRight: '1.5rem' }}>{rx.patientName}</div>
                          {rx.referenceId && (
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginTop: '0.1rem' }}>
                              Ref: {rx.referenceId}
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)', marginTop: '0.15rem' }}>
                            {rx.patientAge} Yrs / {rx.patientGender}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)', marginTop: '0.15rem' }}>
                            {new Date(rx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOfflinePrescription(rx.id);
                            }}
                            style={{
                              position: 'absolute',
                              top: '0.5rem',
                              right: '0.5rem',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              padding: 0
                            }}
                            title="Delete Prescription"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSidebarTab === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Form to add medicine to master list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderBottom: '1px solid var(--neutral-border)', paddingBottom: '1rem', width: '100%' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>Add to Medicine DB</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <input 
                        type="text" 
                        placeholder="Medicine Name (e.g. Dolo)"
                        value={newMedForm.name}
                        onChange={e => setNewMedForm(prev => ({ ...prev, name: e.target.value }))}
                        required
                        style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <input 
                        type="text" 
                        placeholder="Composition (e.g. Paracetamol 650mg)"
                        value={newMedForm.composition}
                        onChange={e => setNewMedForm(prev => ({ ...prev, composition: e.target.value }))}
                        style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <input 
                        type="text" 
                        placeholder="Default Dosage (Optional)"
                        value={newMedForm.dosage}
                        onChange={e => setNewMedForm(prev => ({ ...prev, dosage: e.target.value }))}
                        style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                      />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={saveMedicine} style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', width: '100%', borderRadius: '6px' }}>
                      ➕ Add to Database
                    </button>
                  </div>

                  {/* Medicines database listing */}
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>Database Inventory ({medicinesList.length})</h4>
                    {loadingMedicines ? (
                      <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--neutral-body)', textAlign: 'center', padding: '1rem 0' }}>Loading medicines...</p>
                    ) : medicinesList.length === 0 ? (
                      <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--neutral-body)', textAlign: 'center', padding: '1rem 0' }}>Database is empty.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {medicinesList.map(med => (
                          <div 
                            key={med.id} 
                            style={{ 
                              padding: '0.5rem 0.75rem', 
                              borderRadius: '6px', 
                              border: editingMedId === med.id ? '1px solid var(--primary)' : '1px solid var(--neutral-border)',
                              backgroundColor: editingMedId === med.id ? 'var(--primary-light)' : 'var(--white)',
                              position: 'relative',
                              fontSize: '0.8rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem'
                            }}
                          >
                            {editingMedId === med.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingRight: '1.5rem' }}>
                                <input 
                                  type="text" 
                                  value={editingMedName}
                                  onChange={e => setEditingMedName(e.target.value)}
                                  placeholder="Medicine Name"
                                  style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '100%' }}
                                />
                                <input 
                                  type="text" 
                                  value={editingMedComposition}
                                  onChange={e => setEditingMedComposition(e.target.value)}
                                  placeholder="Composition"
                                  style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '100%' }}
                                />
                                <input 
                                  type="text" 
                                  value={editingMedDosage}
                                  onChange={e => setEditingMedDosage(e.target.value)}
                                  placeholder="Default Dosage (Optional)"
                                  style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '100%' }}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem' }}>
                                  <button 
                                    type="button" 
                                    className="btn btn-primary" 
                                    onClick={() => editMedicine(med.id)}
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                  >
                                    Save
                                  </button>
                                  <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    onClick={() => setEditingMedId(null)}
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontWeight: 700, color: 'var(--neutral-dark)', paddingRight: '2.5rem' }}>{med.name}</div>
                                {med.composition && (
                                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic', marginTop: '0.05rem' }}>
                                    ({med.composition})
                                  </div>
                                )}
                                <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)', marginTop: '0.1rem' }}>
                                  Dosage: {med.dosage || <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>None</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', position: 'absolute', top: '0.4rem', right: '0.4rem' }}>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      setEditingMedId(med.id);
                                      setEditingMedName(med.name);
                                      setEditingMedComposition(med.composition || '');
                                      setEditingMedDosage(med.dosage || '');
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--primary)',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      padding: 0
                                    }}
                                    title="Edit Spelling/Dosage"
                                  >
                                    ✏️
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => deleteMedicine(med.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--danger)',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      padding: 0
                                    }}
                                    title="Delete from Database"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

            {/* Right Side: Form (Left Column) & Live preview (Right Column) */}
            <div className="workspace-split" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'start' }}>
              
              {/* Form Input Panel */}
              <form onSubmit={saveOfflinePrescription} className="glass-panel no-print" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: 'var(--shadow-md)' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {selectedOfflineRxId ? 'Edit Offline Prescription' : 'Create Offline Prescription'}
                </h3>
                
                {/* Reference ID & Consultation Date Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Reference ID (Auto-Generated / Editable)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 104/2026"
                      value={offlineForm.referenceId}
                      onChange={e => setOfflineForm(prev => ({ ...prev, referenceId: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Consultation Date</label>
                    <input 
                      type="date" 
                      value={offlineForm.consultDate}
                      onChange={e => setOfflineForm(prev => ({ ...prev, consultDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Patient Information Row 1: Name & Phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Patient Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      value={offlineForm.patientName}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientName: e.target.value }))}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Phone Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 9876543210"
                      value={offlineForm.patientPhone}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientPhone: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Patient Information Row 2: Age & Gender */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Age</label>
                    <input 
                      type="number" 
                      placeholder="Age"
                      value={offlineForm.patientAge}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientAge: e.target.value }))}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Gender</label>
                    <select 
                      value={offlineForm.patientGender}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientGender: e.target.value }))}
                      required
                      style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Vitals Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Blood Pressure (BP)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 120/80 mmHg"
                      value={offlineForm.bp}
                      onChange={e => setOfflineForm(prev => ({ ...prev, bp: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Pulse Rate</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 72 bpm"
                      value={offlineForm.pulse}
                      onChange={e => setOfflineForm(prev => ({ ...prev, pulse: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Weight (kg)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 68 kg"
                      value={offlineForm.weight}
                      onChange={e => setOfflineForm(prev => ({ ...prev, weight: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Chief Complaints */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Chief Complaints</label>
                  <textarea 
                    placeholder="e.g. Headache for 3 days, difficulty sleeping"
                    rows="2"
                    value={offlineForm.chiefComplaints}
                    onChange={e => setOfflineForm(prev => ({ ...prev, chiefComplaints: e.target.value }))}
                  />
                </div>

                {/* Diagnosis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Clinical Diagnosis Notes</label>
                  <textarea 
                    placeholder="e.g. Mild anxiety disorder with secondary insomnia"
                    rows="2"
                    value={offlineForm.diagnosis}
                    onChange={e => setOfflineForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                    required
                  />
                </div>

                {/* Medications Rx List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  
                  {/* Single Medicine Input Card */}
                  <div 
                    style={{ 
                      border: '1px solid var(--neutral-border)', 
                      borderRadius: '8px', 
                      overflow: 'hidden', 
                      backgroundColor: 'var(--white)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      marginBottom: '1rem'
                    }}
                  >
                    {/* Header Bar */}
                    <div style={{ 
                      backgroundColor: 'var(--primary-light)', 
                      padding: '0.6rem 1rem', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      borderBottom: '1px solid var(--neutral-border)'
                    }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>
                        💊 ADD MEDICINE TO RX
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={async () => {
                          if (!tempMed.name.trim()) {
                            alert('Please fill out the Medicine Name to save to database.');
                            return;
                          }
                          try {
                            const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                name: tempMed.name.trim(),
                                composition: tempMed.composition ? tempMed.composition.trim() : null,
                                dosage: tempMed.dosage ? tempMed.dosage.trim() : null
                              })
                            });
                            const data = await response.json();
                            if (data.success) {
                              setMedicinesList(prev => {
                                const exists = prev.some(m => m.name.toLowerCase() === data.medicine.name.toLowerCase());
                                if (exists) {
                                  return prev.map(m => m.name.toLowerCase() === data.medicine.name.toLowerCase() ? data.medicine : m);
                                }
                                return [...prev, data.medicine].sort((a, b) => a.name.localeCompare(b.name));
                              });
                              alert(`"${tempMed.name}" saved to Medicine Database!`);
                            } else {
                              alert(data.message || 'Failed to save to database.');
                            }
                          } catch (err) {
                            alert('Error saving to database.');
                            console.error(err);
                          }
                        }}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        title="Save this medicine to your database inventory"
                      >
                        💾 Save to DB
                      </button>
                    </div>

                    {/* Stacked Inputs */}
                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* Medicine Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Medicine Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Tab. Paracetamol 650mg"
                          value={tempMed.name}
                          onChange={e => {
                            setTempMed(prev => ({ ...prev, name: e.target.value }));
                            setActiveSearchIndex(999);
                          }}
                          onFocus={() => setActiveSearchIndex(999)}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveSearchIndex(null);
                            }, 150);
                          }}
                          style={{ width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                        />
                        
                        {/* Autocomplete Dropdown list */}
                        {activeSearchIndex === 999 && tempMed.name.trim() !== '' && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: '#fff',
                            border: '1px solid var(--neutral-border)',
                            borderRadius: '6px',
                            maxHeight: '180px',
                            overflowY: 'auto',
                            zIndex: 100,
                            boxShadow: 'var(--shadow-lg)'
                          }}>
                            {(() => {
                              const filtered = medicinesList.filter(m => 
                                m.name.toLowerCase().includes(tempMed.name.toLowerCase()) ||
                                (m.composition && m.composition.toLowerCase().includes(tempMed.name.toLowerCase()))
                              );
                              if (filtered.length === 0) {
                                return (
                                  <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--neutral-body)', fontStyle: 'italic' }}>
                                    No matching medicines in DB.
                                  </div>
                                );
                              }
                              return filtered.map(m => (
                                <div 
                                  key={m.id}
                                  onMouseDown={() => {
                                    setTempMed({
                                      name: m.name,
                                      composition: m.composition || '',
                                      dosage: m.dosage || '',
                                      frequency: tempMed.frequency || ''
                                    });
                                    setActiveSearchIndex(null);
                                  }}
                                  style={{
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    backgroundColor: '#fff'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                                >
                                  <div>
                                    <strong style={{ color: 'var(--neutral-dark)' }}>{m.name}</strong>
                                    {m.composition && (
                                      <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic', marginLeft: '0.35rem' }}>
                                        ({m.composition})
                                      </span>
                                    )}
                                  </div>
                                  {m.dosage && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--neutral-body)' }}>{m.dosage}</span>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Composition */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Composition (Generic Name)</label>
                        <input 
                          type="text" 
                          placeholder="Composition (Optional)"
                          value={tempMed.composition}
                          onChange={e => setTempMed(prev => ({ ...prev, composition: e.target.value }))}
                          style={{ width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* Dosage & Frequency side by side */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Dosage</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 1 Tablet (Optional)"
                            value={tempMed.dosage}
                            onChange={e => setTempMed(prev => ({ ...prev, dosage: e.target.value }))}
                            style={{ width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Frequency & Instructions</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 1-0-1 (after meals)"
                            value={tempMed.frequency}
                            onChange={e => setTempMed(prev => ({ ...prev, frequency: e.target.value }))}
                            style={{ width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>

                      {/* Add to Prescription Button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!tempMed.name.trim()) {
                            alert('Please fill in the Medicine Name before adding.');
                            return;
                          }
                          setOfflineForm(prev => ({
                            ...prev,
                            medications: [...prev.medications, { ...tempMed }]
                          }));
                          setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
                        }}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', marginTop: '0.25rem' }}
                      >
                        ➕ Add to Prescription (Rx)
                      </button>

                    </div>
                  </div>

                  {/* Display List of Added Medicines under the entry box */}
                  {offlineForm.medications.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Added Medicines ({offlineForm.medications.length})</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {offlineForm.medications.map((med, index) => (
                          <div 
                            key={index}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.5rem 0.75rem',
                              backgroundColor: 'var(--neutral-light)',
                              border: '1px solid var(--neutral-border)',
                              borderRadius: '6px',
                              fontSize: '0.8rem'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: 'var(--neutral-dark)' }}>
                                {index + 1}. {med.name}
                              </span>
                              {(med.composition || med.dosage || med.frequency) && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-body)', marginTop: '0.1rem' }}>
                                  {med.composition ? `(${med.composition})` : ''} 
                                  {med.dosage ? ` • ${med.dosage}` : ''} 
                                  {med.frequency ? ` • ${med.frequency}` : ''}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOfflineMedicationRow(index)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                padding: '0.2rem 0.4rem',
                                fontSize: '0.9rem'
                              }}
                              title="Remove from Prescription"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Required Lab Tests */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>🔍 Required Lab Tests / Investigations (Optional)</label>
                  <textarea 
                    placeholder="e.g. CBC, Thyroid Profile, Liver Function Test (LFT)"
                    rows="2"
                    value={offlineForm.requiredTests}
                    onChange={e => setOfflineForm(prev => ({ ...prev, requiredTests: e.target.value }))}
                  />
                </div>

                {/* Advice Notes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>General Advice & Follow-up Instructions</label>
                  <textarea 
                    placeholder="e.g. Practice breathing exercises daily. Follow up in 2 weeks."
                    rows="3"
                    value={offlineForm.advice}
                    onChange={e => setOfflineForm(prev => ({ ...prev, advice: e.target.value }))}
                  />
                </div>

                {/* Follow-up Calendar Datepicker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', border: '1px solid var(--neutral-border)', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--neutral-light)' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>📅 Schedule Next Follow-up (Calendar)</label>
                  <input 
                    type="date" 
                    value={offlineForm.followUpDate}
                    onChange={e => {
                      const selectedVal = e.target.value;
                      setOfflineForm(prev => {
                        const updated = { ...prev, followUpDate: selectedVal };
                        if (selectedVal) {
                          const today = new Date(prev.consultDate || new Date());
                          today.setHours(0,0,0,0);
                          const selected = new Date(selectedVal);
                          selected.setHours(0,0,0,0);
                          const diffTime = selected.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          if (diffDays > 0) {
                            alert(`Auto-calculated follow-up: Visit within ${diffDays} days.`);
                            const followUpText = `Follow-up: Visit within ${diffDays} days (Date: ${selected.toLocaleDateString('en-GB')})`;
                            if (!prev.advice.includes("Visit within")) {
                              updated.advice = prev.advice ? `${prev.advice}\n${followUpText}` : followUpText;
                            } else {
                              const lines = prev.advice.split('\n').filter(line => !line.includes("Visit within"));
                              lines.push(followUpText);
                              updated.advice = lines.join('\n');
                            }
                          } else if (diffDays === 0) {
                            alert("Selected date is today.");
                          } else {
                            alert("Selected date is in the past!");
                          }
                        }
                        return updated;
                      });
                    }}
                    style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    💾 Save Digital Rx
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetOfflineForm}>
                    🧹 Reset Form
                  </button>
                </div>
              </form>

              {/* Layout Sliders & Live Preview Panel */}
              <div className="print-preview-column" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
              {/* Clean Top Action Bar */}
              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--white)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--neutral-border)', boxShadow: 'var(--shadow-sm)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowLayoutSettings(!showLayoutSettings)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}
                >
                  ⚙️ {showLayoutSettings ? 'Hide Layout Settings' : 'Layout Settings'}
                </button>
                
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600 }}
                >
                  🖨️ Print Prescription
                </button>
              </div>

              {/* Collapsible Sliders Grid Controls */}
              {showLayoutSettings && (
                <div className="glass-panel no-print" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--shadow-md)', animation: 'slideDown 0.25s ease-out' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>
                    🎛️ Customize Printable Page Dimensions & Spacing
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Page Width</span>
                        <span>{offlineLayout.pageWidth}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="500" 
                        max="1000" 
                        value={offlineLayout.pageWidth} 
                        onChange={e => setOfflineLayout(prev => ({ ...prev, pageWidth: parseInt(e.target.value) }))}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Page Height</span>
                        <span>{offlineLayout.pageHeight}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="800" 
                        max="1500" 
                        value={offlineLayout.pageHeight} 
                        onChange={e => setOfflineLayout(prev => ({ ...prev, pageHeight: parseInt(e.target.value) }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Font Size (Base)</span>
                        <span>{offlineLayout.fontSize}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="10" 
                        max="22" 
                        step="0.5"
                        value={offlineLayout.fontSize} 
                        onChange={e => setOfflineLayout(prev => ({ ...prev, fontSize: parseFloat(e.target.value) }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Margins (Padding)</span>
                        <span>{offlineLayout.marginSize}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="15" 
                        max="80" 
                        value={offlineLayout.marginSize} 
                        onChange={e => setOfflineLayout(prev => ({ ...prev, marginSize: parseInt(e.target.value) }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Row Spacing</span>
                        <span>{offlineLayout.rowSpacing}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="4" 
                        max="24" 
                        value={offlineLayout.rowSpacing} 
                        onChange={e => setOfflineLayout(prev => ({ ...prev, rowSpacing: parseInt(e.target.value) }))}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: 'span 2', marginTop: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id="use-letterhead-offline" 
                        checked={offlineLayout.useLetterhead} 
                        onChange={e => {
                          const val = e.target.checked;
                          localStorage.setItem('useLetterheadOffline', val ? 'true' : 'false');
                          setOfflineLayout(prev => ({ ...prev, useLetterhead: val }));
                        }}
                        style={{ cursor: 'pointer', width: 'auto' }}
                      />
                      <label htmlFor="use-letterhead-offline" style={{ fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                        Print on Pre-printed Letterhead (2.75" Header, 1.75" Footer)
                      </label>
                    </div>

                  </div>
                </div>
              )}

                {/* Printable Preview Sheet Box */}
                <div className="print-preview-container-wrapper" style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#cbd5e1', padding: '1.5rem', borderRadius: '12px', overflowX: 'auto', border: '1px solid var(--neutral-border)' }}>
                  
                  {/* Printable Page Sheet */}
                  <div 
                    className="printable-prescription-preview"
                    style={{ 
                      width: `${offlineLayout.pageWidth}px`, 
                      height: `${offlineLayout.pageHeight}px`,
                      paddingTop: offlineLayout.useLetterhead ? '264px' : `${offlineLayout.marginSize}px`,
                      paddingBottom: offlineLayout.useLetterhead ? '168px' : `${offlineLayout.marginSize}px`,
                      paddingLeft: `${offlineLayout.marginSize}px`,
                      paddingRight: `${offlineLayout.marginSize}px`,
                      fontSize: `${offlineLayout.fontSize}px`,
                      backgroundColor: '#fff',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-family)',
                      position: 'relative',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      {/* Premium Letterhead Header */}
                      {!offlineLayout.useLetterhead && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '2px solid #0f766e', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.45em', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: 'var(--font-family)' }}>MENTAL WELLNESS CLINIC</div>
                            <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#475569', marginTop: '0.15rem' }}>Mind & Brain Specialist Centre</div>
                            <div style={{ color: '#64748b', fontSize: '0.7em', marginTop: '0.1rem' }}>Ugf 19, Subash Chandra Bose Complex, Chowk, Lucknow, UP</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9em', color: '#0d9488' }}>Consultant Neuropsychiatrist</div>
                            <div style={{ fontWeight: 700, fontSize: '0.85em', color: '#1e293b', marginTop: '0.15rem' }}>Dr. Priyadarshi Srivastava</div>
                            <div style={{ fontSize: '0.7em', color: '#64748b' }}>MBBS, MD (Neuropsychiatry)</div>
                          </div>
                        </div>
                      )}

                      {/* Structured Patient Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '0.75rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.6rem 0.8rem', fontSize: '0.82em', marginBottom: '1.25rem', backgroundColor: '#f8fafc' }}>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>PATIENT NAME</strong></div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.05em', marginTop: '0.1rem' }}>{offlineForm.patientName || '__________________'}</div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>AGE / GENDER</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>
                            {offlineForm.patientAge ? `${offlineForm.patientAge} Yrs` : '___ Yrs'} / {offlineForm.patientGender}
                          </div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>PHONE NUMBER</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>{offlineForm.patientPhone || '__________________'}</div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>DATE OF CONSULTATION</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>
                            {formatPrintDate(offlineForm.consultDate)}
                          </div>
                        </div>
                        
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem' }}>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>BLOOD PRESSURE</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>{offlineForm.bp || '___/___ mmHg'}</div>
                        </div>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem' }}>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>PULSE RATE</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>{offlineForm.pulse || '___ bpm'}</div>
                        </div>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem' }}>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>WEIGHT</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>{offlineForm.weight || '___ kg'}</div>
                        </div>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem' }}>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>RX ID / REFERENCE</strong></div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1em', marginTop: '0.1rem' }}>
                            {offlineForm.referenceId || (selectedOfflineRxId ? `OFF-RX-${selectedOfflineRxId.slice(0, 8).toUpperCase()}` : 'OFFLINE-NEW')}
                          </div>
                        </div>
                      </div>

                      {/* Side-by-Side Content Layout below Patient Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', marginTop: '1rem', alignItems: 'start' }}>
                        
                        {/* Left Column: Diagnosis & Clinical Notes, Chief Complaints, Tests & General Advice */}
                        <div style={{ borderRight: '1px solid #cbd5e1', paddingRight: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '300px' }}>
                          
                          {/* 1. Chief Complaints Card */}
                          <div>
                            <div style={{ fontSize: '0.75em', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>CHIEF COMPLAINTS</div>
                            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                              <div style={{ width: '4px', backgroundColor: '#3b82f6' }}></div>
                              <div style={{ flex: 1, padding: '0.6rem 0.8rem', backgroundColor: '#f8fafc', fontSize: '0.85em', color: offlineForm.chiefComplaints ? '#000000' : '#94a3b8', fontWeight: offlineForm.chiefComplaints ? 700 : 'normal', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontStyle: offlineForm.chiefComplaints ? 'normal' : 'italic' }}>
                                {offlineForm.chiefComplaints || 'No complaints recorded.'}
                              </div>
                            </div>
                          </div>

                          {/* 2. Notes / Diagnosis Card */}
                          <div>
                            <div style={{ fontSize: '0.75em', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>DIAGNOSIS & NOTES</div>
                            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                              <div style={{ width: '4px', backgroundColor: '#0f766e' }}></div>
                              <div style={{ flex: 1, padding: '0.6rem 0.8rem', backgroundColor: '#f8fafc', fontSize: '0.85em', color: offlineForm.diagnosis ? '#000000' : '#94a3b8', fontWeight: offlineForm.diagnosis ? 700 : 'normal', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontStyle: offlineForm.diagnosis ? 'normal' : 'italic' }}>
                                {offlineForm.diagnosis || 'No clinical diagnosis recorded.'}
                              </div>
                            </div>
                          </div>

                          {/* 3. Recommended/Required Tests Card (Optional) */}
                          {offlineForm.requiredTests && (
                            <div>
                              <div style={{ fontSize: '0.75em', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>TESTS REQUIRED</div>
                              <div style={{ display: 'flex', border: '1px solid #fed7aa', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ width: '4px', backgroundColor: '#ea580c' }}></div>
                                <div style={{ flex: 1, padding: '0.6rem 0.8rem', backgroundColor: '#fff7ed', fontSize: '0.85em', color: '#000000', fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                  {offlineForm.requiredTests}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 4. General Advice Card */}
                          {offlineForm.advice && (
                            <div>
                              <div style={{ fontSize: '0.75em', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>GENERAL ADVICE</div>
                              <div style={{ display: 'flex', border: '1px solid #ccfbf1', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ width: '4px', backgroundColor: '#0d9488' }}></div>
                                <div style={{ flex: 1, padding: '0.6rem 0.8rem', backgroundColor: '#f0fdfa', fontSize: '0.85em', color: '#000000', fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                  {offlineForm.advice}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Column: Prescribed Medications (Rx) */}
                        <div>
                          {/* Rx symbol */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '1.8em', fontWeight: 'bold', color: '#0d9488', fontFamily: 'serif' }}>℞</span>
                            <span style={{ fontSize: '0.85em', fontWeight: 800, color: '#1e293b', letterSpacing: '0.05em' }}>PRESCRIBED MEDICATIONS</span>
                          </div>

                          {/* Medications Grid */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em', marginBottom: '1.5rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '2.5px solid #0f766e', color: '#000000', textAlign: 'left', backgroundColor: '#ffffff' }}>
                                <th style={{ padding: `${offlineLayout.rowSpacing / 2}px 10px`, fontSize: '0.8em', fontWeight: 800 }}>MEDICINE NAME</th>
                                <th style={{ padding: `${offlineLayout.rowSpacing / 2}px 10px`, fontSize: '0.8em', fontWeight: 800 }}>DOSAGE</th>
                                <th style={{ padding: `${offlineLayout.rowSpacing / 2}px 10px`, fontSize: '0.8em', fontWeight: 800 }}>FREQUENCY & INSTRUCTIONS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {offlineForm.medications.map((med, idx) => (
                                <tr 
                                  key={idx} 
                                  style={{ 
                                    backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#fff',
                                    borderBottom: '1px solid #f1f5f9'
                                  }}
                                >
                                  <td style={{ padding: `${offlineLayout.rowSpacing}px 10px`, color: '#000000' }}>
                                    <div style={{ fontWeight: 800 }}>{med.name || '__________________'}</div>
                                    {med.composition && med.composition.trim() && (
                                      <div style={{ fontSize: '0.85em', color: '#b91c1c', fontWeight: 700, fontStyle: 'italic', marginTop: '0.15rem' }}>
                                        ({med.composition.trim()})
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: `${offlineLayout.rowSpacing}px 10px`, color: '#000000', fontWeight: 700 }}>{med.dosage || ''}</td>
                                  <td style={{ padding: `${offlineLayout.rowSpacing}px 10px`, color: '#000000', fontWeight: 700 }}>{med.frequency || '_______________'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                      </div>
                    </div>

                    {/* Signature block bottom aligned */}
                    <div>
                      {!offlineLayout.useLetterhead && (
                        <div style={{ textAlign: 'center', fontSize: '0.7em', color: '#94a3b8', marginTop: '1rem' }}>
                          This is a digitally generated secure e-Prescription. Valid without physical signature.
                        </div>
                      )}
                    </div>

                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      </main>

      {/* Prescription workspace Modal */}
      {selectedAppt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 100, overflowY: 'auto' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '720px', padding: '2.5rem', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>Prescription Workspace</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedAppt(null)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}>✕ Close</button>
            </div>

            <div style={{ backgroundColor: 'var(--neutral-light)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--neutral-border)' }}>
              <strong>Patient Details:</strong> {selectedAppt.patientName} ({selectedAppt.patientAge} Years) | Booking ID: {selectedAppt.bookingId}
            </div>

            {generatedPdfUrl ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <span style={{ fontSize: '3rem' }}>🎉</span>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1rem 0' }}>Prescription Document Generated Successfully!</h4>
                <p style={{ color: 'var(--neutral-body)', marginBottom: '1.5rem' }}>The patient has been notified via SMS and Email with a direct download link.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <a href={`${API_URL}${generatedPdfUrl}`} target="_blank" rel="noreferrer" className="btn btn-primary">
                    🖨️ View / Print Prescription PDF
                  </a>
                  <button className="btn btn-secondary" onClick={() => setSelectedAppt(null)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitPrescription} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Diagnosis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Clinical Diagnosis</label>
                  <textarea 
                    placeholder="e.g. Mild anxiety disorder with secondary insomnia."
                    rows="3"
                    value={prescriptionForm.diagnosis}
                    onChange={e => setPrescriptionForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                    required
                  />
                </div>

                {/* Medications Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Prescribed Medications (Rx)</span>
                    <button type="button" className="btn btn-secondary" onClick={addMedicationRow} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      + Add Medicine
                    </button>
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {prescriptionForm.medications.map((med, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 40px', gap: '0.5rem', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          placeholder="Medicine Name (e.g. Dolo)"
                          value={med.name}
                          onChange={e => handleMedicationChange(index, 'name', e.target.value)}
                          required
                        />
                        <input 
                          type="text" 
                          placeholder="Composition (Optional)"
                          value={med.composition || ''}
                          onChange={e => handleMedicationChange(index, 'composition', e.target.value)}
                        />
                        <input 
                          type="text" 
                          placeholder="Dosage (e.g. 1 tab)"
                          value={med.dosage}
                          onChange={e => handleMedicationChange(index, 'dosage', e.target.value)}
                          required
                        />
                        <input 
                          type="text" 
                          placeholder="Frequency (e.g. Once daily)"
                          value={med.frequency}
                          onChange={e => handleMedicationChange(index, 'frequency', e.target.value)}
                          required
                        />
                        <button 
                          type="button" 
                          className="btn btn-danger" 
                          onClick={() => removeMedicationRow(index)}
                          style={{ padding: '0.5rem', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                          disabled={prescriptionForm.medications.length === 1}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General Advice */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>General Advice & Follow-up Instructions</label>
                  <textarea 
                    placeholder="e.g. Practice breathing exercises daily. Avoid blue screens 1 hour before bedtime. Follow-up in 2 weeks."
                    rows="3"
                    value={prescriptionForm.advice}
                    onChange={e => setPrescriptionForm(prev => ({ ...prev, advice: e.target.value }))}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={prescriptionSubmitting}>
                  {prescriptionSubmitting ? 'Generating PDF...' : 'Sign & Submit Prescription'}
                </button>

              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// Component representing an individual appointment card
function AppointmentCard({ appt, onStatusChange, onWritePrescription, onJoinVideoCall }) {
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  const dateStr = new Date(appt.appointmentDate).toLocaleDateString('en-US', options);

  let statusBadgeClass = 'badge-warning';
  if (appt.status === 'COMPLETED') statusBadgeClass = 'badge-success';
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') statusBadgeClass = 'badge-danger';

  return (
    <div style={{ border: '1px solid var(--neutral-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--white)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>{appt.patientName}</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>({appt.patientAge} Years)</span>
          <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '0.7rem' }}>{appt.status}</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>
          Contact: +91 {appt.patientPhone} | Booking ID: <strong>{appt.bookingId}</strong>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--neutral-dark)', backgroundColor: 'var(--neutral-light)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.25rem', display: 'inline-block', border: '1px dashed var(--neutral-border)' }}>
          Symptoms: {appt.symptoms}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{appt.slotTime}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>{dateStr}</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {appt.status === 'SCHEDULED' && (
            <>
              {onJoinVideoCall && (
                <button className="btn btn-primary" onClick={onJoinVideoCall} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#4f46e5', borderColor: '#4f46e5' }}>
                  🎥 Join Room
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => onStatusChange(appt.id, 'NO_SHOW')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
                No-Show
              </button>
              <button className="btn btn-danger" onClick={() => onStatusChange(appt.id, 'CANCELLED')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
                Cancel
              </button>
            </>
          )}

          {(appt.status === 'SCHEDULED' || appt.status === 'COMPLETED') && (
            <button className="btn btn-primary" onClick={onWritePrescription} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
              {appt.prescription ? 'Edit Prescription' : '📄 Rx Prescription'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
