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
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const formatBP = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/mmhg/i.test(trimmed)) return trimmed;
  return `${trimmed} mmHg`;
};

const formatPulse = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/bpm/i.test(trimmed)) return trimmed;
  return `${trimmed} bpm`;
};

const formatWeight = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/kg/i.test(trimmed)) return trimmed;
  return `${trimmed} kg`;
};

const ALL_FONTS = [
  // Sans-serif
  { name: 'Plus Jakarta Sans', category: 'Sans-serif' },
  { name: 'Inter', category: 'Sans-serif' },
  { name: 'Roboto', category: 'Sans-serif' },
  { name: 'Open Sans', category: 'Sans-serif' },
  { name: 'Lato', category: 'Sans-serif' },
  { name: 'Montserrat', category: 'Sans-serif' },
  { name: 'Poppins', category: 'Sans-serif' },
  { name: 'Source Sans 3', category: 'Sans-serif' },
  { name: 'Oswald', category: 'Sans-serif' },
  { name: 'Raleway', category: 'Sans-serif' },
  { name: 'Ubuntu', category: 'Sans-serif' },
  { name: 'Nunito', category: 'Sans-serif' },
  { name: 'Rubik', category: 'Sans-serif' },
  { name: 'Work Sans', category: 'Sans-serif' },
  { name: 'DM Sans', category: 'Sans-serif' },
  { name: 'Outfit', category: 'Sans-serif' },
  { name: 'Manrope', category: 'Sans-serif' },
  { name: 'Fira Sans', category: 'Sans-serif' },
  
  // Serif
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'PT Serif', category: 'Serif' },
  { name: 'Lora', category: 'Serif' },
  { name: 'Noto Serif', category: 'Serif' },
  { name: 'Arvo', category: 'Serif' },
  { name: 'Crimson Text', category: 'Serif' },
  { name: 'Libre Baskerville', category: 'Serif' },
  { name: 'EB Garamond', category: 'Serif' },
  { name: 'Cardo', category: 'Serif' },
  { name: 'Cinzel', category: 'Serif' },
  { name: 'Domine', category: 'Serif' },
  { name: 'Georgia', category: 'Serif' },
  
  // Monospace
  { name: 'Fira Code', category: 'Monospace' },
  { name: 'Source Code Pro', category: 'Monospace' },
  { name: 'Inconsolata', category: 'Monospace' },
  { name: 'Courier Prime', category: 'Monospace' },
  { name: 'Share Tech Mono', category: 'Monospace' },
  
  // Handwriting / Script
  { name: 'Dancing Script', category: 'Handwriting' },
  { name: 'Pacifico', category: 'Handwriting' },
  { name: 'Caveat', category: 'Handwriting' },
  { name: 'Great Vibes', category: 'Handwriting' },
  { name: 'Sacramento', category: 'Handwriting' },
  { name: 'Satisfy', category: 'Handwriting' },
];

const DEFAULT_SYMPTOM_TEMPLATES = [
  {
    id: 'migraine',
    category: 'Migraine & Headache',
    icon: '🤕',
    symptoms: [
      'Dizziness sometimes',
      'Feels weakness in head',
      'Heaviness in head',
      'Throbbing / Pulsating headache',
      'Pain behind the eyes',
      'Nausea / Vomiting tendency',
      'Photophobia (Light sensitivity)',
      'Phonophobia (Sound sensitivity)'
    ]
  },
  {
    id: 'anxiety',
    category: 'Anxiety & Panic',
    icon: '⚡',
    symptoms: [
      'Palpitations / Fast heartbeat',
      'Excessive worrying & nervousness',
      'Restlessness & inability to relax',
      'Chest tightness / Heaviness',
      'Trembling of hands / Shivering',
      'Panic episodes / Sudden fear',
      'Shortness of breath / Choking feeling',
      'Excessive sweating / Cold hands'
    ]
  },
  {
    id: 'depression',
    category: 'Depression & Mood',
    icon: '🌧️',
    symptoms: [
      'Persistent low mood / Sadness',
      'Loss of interest in activities (Anhedonia)',
      'Fatigue & lack of energy / Lethargy',
      'Hopelessness / Helplessness',
      'Poor concentration & focus',
      'Crying spells / Frequent weeping',
      'Decreased appetite / Weight loss',
      'Negative & overthinking thoughts'
    ]
  },
  {
    id: 'insomnia',
    category: 'Insomnia & Sleep',
    icon: '🌙',
    symptoms: [
      'Difficulty falling asleep (Delayed onset)',
      'Frequent night awakenings',
      'Early morning awakening',
      'Non-refreshing / Disturbed sleep',
      'Daytime drowsiness / Fatigue',
      'Nightmares / Vivid disturbing dreams'
    ]
  },
  {
    id: 'psychosis',
    category: 'Psychosis & Schizophrenia',
    icon: '🧠',
    symptoms: [
      'Auditory hallucinations (Hearing voices)',
      'Suspiciousness & persecutory ideas',
      'Irrelevant / Disorganized speech',
      'Aggressive / Agitated behavior',
      'Self-muttering / Smiling alone',
      'Severe social withdrawal',
      'Poor self-care & personal hygiene'
    ]
  },
  {
    id: 'ocd',
    category: 'OCD & Intrusive Thoughts',
    icon: '🔄',
    symptoms: [
      'Repeated hand washing / Contamination fear',
      'Repeated checking (Locks, gas, switches)',
      'Repetitive intrusive thoughts / Doubts',
      'Counting / Symmetry & order rituals',
      'Mental compulsions & distress'
    ]
  },
  {
    id: 'bipolar',
    category: 'Bipolar & Mania',
    icon: '🔥',
    symptoms: [
      'Decreased need for sleep (without fatigue)',
      'Elevated / Expansive mood',
      'Racing thoughts & rapid speech',
      'Grandiosity / Over-confidence',
      'Excessive spending / Risky behavior',
      'High irritability / Anger outbursts'
    ]
  },
  {
    id: 'somatic',
    category: 'Somatic & Body Aches',
    icon: '⚡',
    symptoms: [
      'Generalized body pain / Fibromyalgia',
      'Burning sensation in palms & soles',
      'Gastric discomfort / Abdominal bloating',
      'Tingling & numbness in limbs',
      'Chronic unrefreshing fatigue'
    ]
  }
];

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
  const [originalConsultDate, setOriginalConsultDate] = useState('');
  
  const [rxSearchQuery, setRxSearchQuery] = useState('');
  const [expandedRxHistoryIds, setExpandedRxHistoryIds] = useState(new Set());
  const [quickLookupQuery, setQuickLookupQuery] = useState('');
  const [showQuickLookupDropdown, setShowQuickLookupDropdown] = useState(false);
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
    useLetterhead: localStorage.getItem('useLetterheadOffline') === 'true',
    showSignature: localStorage.getItem('showSignatureOffline') !== 'false',
    signatureSize: parseInt(localStorage.getItem('signatureSizeOffline')) || 220,
    signaturePosition: localStorage.getItem('signaturePositionOffline') || 'inline',
    signatureXOffset: parseInt(localStorage.getItem('signatureXOffsetOffline')) || 0,
    signatureYOffset: parseInt(localStorage.getItem('signatureYOffsetOffline')) || 0,
    fontFamily: localStorage.getItem('fontFamilyOffline') || 'Plus Jakarta Sans'
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
  const [editingOfflineMedIndex, setEditingOfflineMedIndex] = useState(null);
  const [editingOfflineMed, setEditingOfflineMed] = useState({ name: '', composition: '', dosage: '', frequency: '' });
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [fontSearchQuery, setFontSearchQuery] = useState('');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  // Clinical Research & Medicine Analytics State
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState('overview'); // 'overview', 'medicine', 'volume'
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState('all'); // 'all', '30days', '90days', '1year'
  const [overviewAnalytics, setOverviewAnalytics] = useState(null);
  const [searchedMedicine, setSearchedMedicine] = useState('');
  const [medicineAnalytics, setMedicineAnalytics] = useState(null);
  const [patientVolumeData, setPatientVolumeData] = useState(null);
  const [volumeMonthFilter, setVolumeMonthFilter] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [medSearchInput, setMedSearchInput] = useState('');
  const [medSearchSuggestions, setMedSearchSuggestions] = useState([]);

  // Symptom Checklist & Master Templates State
  const [symptomTemplates, setSymptomTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('doctor_symptom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SYMPTOM_TEMPLATES;
  });
  const [showSymptomDrawer, setShowSymptomDrawer] = useState(false);
  const [activeSymptomCat, setActiveSymptomCat] = useState('migraine');
  const [symptomSearchQuery, setSymptomSearchQuery] = useState('');
  const [showSymptomManagerModal, setShowSymptomManagerModal] = useState(false);
  const [managerSelectedCatId, setManagerSelectedCatId] = useState('migraine');
  const [managerNewCategoryName, setManagerNewCategoryName] = useState('');
  const [managerNewCategoryIcon, setManagerNewCategoryIcon] = useState('🧠');
  const [managerNewSymptomText, setManagerNewSymptomText] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryIcon, setEditingCategoryIcon] = useState('');
  const [editingSymptomIdx, setEditingSymptomIdx] = useState(null);
  const [editingSymptomText, setEditingSymptomText] = useState('');

  // Save templates to state and localStorage
  const saveSymptomTemplates = (newTemplates) => {
    setSymptomTemplates(newTemplates);
    try {
      localStorage.setItem('doctor_symptom_templates', JSON.stringify(newTemplates));
    } catch (e) {
      console.error(e);
    }
  };

  // Check if a symptom is currently in chief complaints text
  const isSymptomChecked = (symText) => {
    if (!offlineForm.chiefComplaints || !symText) return false;
    const current = offlineForm.chiefComplaints.toLowerCase();
    const target = symText.toLowerCase().trim();
    const parts = current.split(/[,;\n]+/).map(p => p.trim());
    return parts.some(p => p === target || p.includes(target));
  };

  // Toggle symptom in chief complaints
  const toggleSymptom = (symText) => {
    if (!symText) return;
    const cleanTarget = symText.trim();
    const current = (offlineForm.chiefComplaints || '').trim();

    if (!current) {
      setOfflineForm(prev => ({ ...prev, chiefComplaints: cleanTarget }));
      return;
    }

    const items = current.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const targetLower = cleanTarget.toLowerCase();
    const existsIndex = items.findIndex(item => item.toLowerCase() === targetLower);

    if (existsIndex >= 0) {
      items.splice(existsIndex, 1);
      setOfflineForm(prev => ({ ...prev, chiefComplaints: items.join(', ') }));
    } else {
      items.push(cleanTarget);
      setOfflineForm(prev => ({ ...prev, chiefComplaints: items.join(', ') }));
    }
  };

  // Add new category row
  const addCategoryRow = (name, icon = '🧠') => {
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const newCat = {
      id,
      category: name.trim(),
      icon: icon || '🧠',
      symptoms: []
    };
    const updated = [...symptomTemplates, newCat];
    saveSymptomTemplates(updated);
    setActiveSymptomCat(id);
    setManagerSelectedCatId(id);
    setManagerNewCategoryName('');
  };

  // Edit category row
  const editCategoryRow = (id, newName, newIcon) => {
    if (!newName || !newName.trim()) return;
    const updated = symptomTemplates.map(cat => {
      if (cat.id === id) {
        return { ...cat, category: newName.trim(), icon: newIcon || cat.icon };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setEditingCategoryId(null);
  };

  // Delete category row
  const deleteCategoryRow = (id) => {
    const cat = symptomTemplates.find(c => c.id === id);
    if (!window.confirm(`Are you sure you want to delete category "${cat?.category || 'this'}" and all its symptoms?`)) return;
    const updated = symptomTemplates.filter(c => c.id !== id);
    saveSymptomTemplates(updated);
    if (activeSymptomCat === id && updated.length > 0) {
      setActiveSymptomCat(updated[0].id);
    }
    if (managerSelectedCatId === id && updated.length > 0) {
      setManagerSelectedCatId(updated[0].id);
    }
  };

  // Add sub-symptom to category
  const addSymptomSubRow = (categoryId, symptomText) => {
    if (!symptomText || !symptomText.trim()) return;
    const cleanText = symptomText.trim();
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        if (cat.symptoms.includes(cleanText)) return cat;
        return { ...cat, symptoms: [...cat.symptoms, cleanText] };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setManagerNewSymptomText('');
  };

  // Edit sub-symptom
  const editSymptomSubRow = (categoryId, oldText, newText) => {
    if (!newText || !newText.trim()) return;
    const cleanNew = newText.trim();
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          symptoms: cat.symptoms.map(s => s === oldText ? cleanNew : s)
        };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setEditingSymptomIdx(null);
  };

  // Delete sub-symptom
  const deleteSymptomSubRow = (categoryId, symptomText) => {
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        return { ...cat, symptoms: cat.symptoms.filter(s => s !== symptomText) };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
  };

  // Reset to default clinical master
  const resetSymptomTemplates = () => {
    if (!window.confirm('Reset all symptom categories and sub-rows back to original clinical default master?')) return;
    saveSymptomTemplates(DEFAULT_SYMPTOM_TEMPLATES);
    setActiveSymptomCat(DEFAULT_SYMPTOM_TEMPLATES[0].id);
    setManagerSelectedCatId(DEFAULT_SYMPTOM_TEMPLATES[0].id);
  };

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
    if (offlineLayout.fontFamily) {
      const fontId = `gfont-${offlineLayout.fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
      if (!document.getElementById(fontId) && offlineLayout.fontFamily !== 'Georgia' && offlineLayout.fontFamily !== 'Courier New') {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(offlineLayout.fontFamily)}:wght@400;600;700;800&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [offlineLayout.fontFamily]);

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

  // Fetch next reference ID from API (only for brand new patients or when forced)
  const fetchNextReferenceId = async (force = false) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions/next-reference`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setOfflineForm(prev => {
          // If we already have a reference ID and this is not a forced reset for a brand new patient, KEEP IT!
          if (!force && prev.referenceId && prev.referenceId.trim()) {
            return prev;
          }
          return { ...prev, referenceId: data.nextReferenceId };
        });
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

  // Fetch Overview Analytics
  const fetchOverviewAnalytics = async (timeframe = analyticsTimeframe) => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/overview?timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOverviewAnalytics(data.data);
      }
    } catch (err) {
      console.error('Failed to load overview analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Extract distinct active compositions from medicines list and past prescriptions
  const getDistinctCompositions = () => {
    const compMap = new Map();
    (medicinesList || []).forEach(m => {
      if (m.composition && m.composition.trim()) {
        const c = m.composition.trim();
        if (!compMap.has(c.toLowerCase())) {
          compMap.set(c.toLowerCase(), c);
        }
      }
    });
    (offlineRxList || []).forEach(rx => {
      let rawMeds = rx.medications;
      if (typeof rawMeds === 'string') {
        try { rawMeds = JSON.parse(rawMeds); } catch (e) { rawMeds = []; }
      }
      if (Array.isArray(rawMeds)) {
        rawMeds.forEach(m => {
          if (m && m.composition && m.composition.trim()) {
            const c = m.composition.trim();
            if (!compMap.has(c.toLowerCase())) {
              compMap.set(c.toLowerCase(), c);
            }
          }
        });
      }
    });
    return Array.from(compMap.values());
  };

  // Fetch Specific Composition Research & Patient Usage Analytics
  const fetchMedicineAnalytics = async (medName, timeframe = analyticsTimeframe) => {
    if (!token || !medName || !medName.trim()) return;
    setAnalyticsLoading(true);
    const cleanName = medName.trim();
    setSearchedMedicine(cleanName);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/medicine?composition=${encodeURIComponent(cleanName)}&timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMedicineAnalytics(data.data);
        setAnalyticsTab('medicine');
      } else {
        alert(data.message || 'No data found for this composition.');
      }
    } catch (err) {
      console.error('Failed to load composition analytics:', err);
      alert('Error loading composition analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Fetch Practice & Patient Volume Analytics (Daily & Monthly New vs Follow-up)
  const fetchPatientVolumeAnalytics = async (month = volumeMonthFilter) => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const monthQuery = month ? `&month=${month}` : '';
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/patient-volume?timeframe=${analyticsTimeframe}${monthQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPatientVolumeData(data.data);
      }
    } catch (err) {
      console.error('Failed to load patient volume analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Export Analytics Data to CSV
  const exportAnalyticsCSV = () => {
    if (!overviewAnalytics && !medicineAnalytics && !patientVolumeData) {
      alert('No analytics data to export.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";

    if (analyticsTab === 'medicine' && medicineAnalytics) {
      csvContent += `Medicine Research & Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Searched Medicine,${medicineAnalytics.canonicalName}\r\n`;
      csvContent += `Composition,${medicineAnalytics.canonicalComposition || 'N/A'}\r\n`;
      csvContent += `Total Patients Prescribed,${medicineAnalytics.totalPatients}\r\n`;
      csvContent += `Total Prescriptions Written,${medicineAnalytics.totalPrescriptions}\r\n\r\n`;

      csvContent += `Dosage Distribution\r\nDosage,Patient Count,Percentage\r\n`;
      (medicineAnalytics.dosageHistogram || []).forEach(d => {
        csvContent += `"${d.dosage}",${d.count},${d.percentage}%\r\n`;
      });

      csvContent += `\r\nAge Demographics Histogram\r\nAge Range,Count,Percentage\r\n`;
      (medicineAnalytics.ageHistogram || []).forEach(a => {
        csvContent += `"${a.range}",${a.count},${a.percentage}%\r\n`;
      });

      csvContent += `\r\nTop Diagnoses\r\nDiagnosis,Prescription Count,Percentage\r\n`;
      (medicineAnalytics.topDiagnoses || []).forEach(diag => {
        csvContent += `"${diag.diagnosis}",${diag.count},${diag.percentage}%\r\n`;
      });

      csvContent += `\r\nCo-Prescribed Medications\r\nMedication,Co-occurrence Count,Rate\r\n`;
      (medicineAnalytics.coPrescriptions || []).forEach(co => {
        csvContent += `"${co.name}",${co.count},${co.coOccurrenceRate}%\r\n`;
      });
    } else if (analyticsTab === 'volume' && patientVolumeData) {
      csvContent += `Doctor Practice & Patient Volume Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Total Consultations,${patientVolumeData.totalConsultations}\r\n`;
      csvContent += `Total Unique Patients,${patientVolumeData.totalUniquePatients}\r\n`;
      csvContent += `Total New Patients (First Visits),${patientVolumeData.totalNewPatients}\r\n`;
      csvContent += `Total Follow-Up Consultations,${patientVolumeData.totalFollowUps}\r\n`;
      csvContent += `Follow-Up Retention Rate,${patientVolumeData.retentionRate}%\r\n`;
      csvContent += `Average Patients Per Day,${patientVolumeData.avgPatientsPerDay}\r\n\r\n`;

      csvContent += `Monthly Patient Footfall\r\nMonth,Total Consultations,New Patients,Follow-Up Visits,Follow-Up %,MoM Growth %\r\n`;
      (patientVolumeData.monthlyVolume || []).forEach(m => {
        csvContent += `"${m.monthLabel}",${m.total},${m.newPatients},${m.followUps},${m.followUpRate}%,${m.momGrowth > 0 ? '+' : ''}${m.momGrowth}%\r\n`;
      });

      csvContent += `\r\nDaily Patient Footfall Log\r\nDate,Day,Total Patients,New Patients,Follow-Up Patients\r\n`;
      (patientVolumeData.dailyVolume || []).forEach(d => {
        csvContent += `"${d.dateLabel}","${d.dayOfWeek}",${d.total},${d.newPatients},${d.followUps}\r\n`;
      });

      csvContent += `\r\nDay-of-Week Consultation Heatmap\r\nWeekday,Total Visits,Avg Patients/Day,New Patients,Follow-Ups\r\n`;
      (patientVolumeData.dayOfWeekPattern || []).forEach(w => {
        csvContent += `"${w.day}",${w.totalVisits},${w.avgPatientsPerDay},${w.newPatients},${w.followUps}\r\n`;
      });
    } else if (overviewAnalytics) {
      csvContent += `Clinic Global Prescription & Clinical Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Total Prescriptions Analyzed,${overviewAnalytics.totalPrescriptions}\r\n`;
      csvContent += `Total Unique Patients,${overviewAnalytics.totalUniquePatients}\r\n`;
      csvContent += `Total Unique Medicines,${overviewAnalytics.totalUniqueMedicines}\r\n\r\n`;

      csvContent += `Top Prescribed Medicines\r\nRank,Medicine Name,Composition,Patients Prescribed,Prescription Count\r\n`;
      (overviewAnalytics.topMedicines || []).forEach((m, idx) => {
        csvContent += `${idx + 1},"${m.name}","${m.composition || 'N/A'}",${m.patientCount},${m.prescriptionCount}\r\n`;
      });

      csvContent += `\r\nTop Diagnoses Distribution\r\nDiagnosis,Count,Percentage\r\n`;
      (overviewAnalytics.topDiagnoses || []).forEach(d => {
        csvContent += `"${d.name}",${d.count},${d.percentage}%\r\n`;
      });

      csvContent += `\r\nOverall Age Demographics Histogram\r\nAge Range,Count,Percentage\r\n`;
      (overviewAnalytics.ageHistogram || []).forEach(a => {
        csvContent += `"${a.range}",${a.count},${a.percentage}%\r\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    let fileName = `clinic_prescription_analytics_${Date.now()}.csv`;
    if (analyticsTab === 'medicine' && medicineAnalytics) {
      fileName = `medicine_analytics_${medicineAnalytics.canonicalName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`;
    } else if (analyticsTab === 'volume' && patientVolumeData) {
      fileName = `doctor_practice_volume_${Date.now()}.csv`;
    }
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Save/Submit offline prescription
  const saveOfflinePrescription = async (e) => {
    if (e) e.preventDefault();
    if (!token) return false;

    // Proactively add any currently typed tempMed to the list so the doctor doesn't lose it
    let currentMeds = [...(offlineForm.medications || [])];
    if (tempMed.name && tempMed.name.trim()) {
      currentMeds.push({ ...tempMed });
      // Update state for consistency
      setOfflineForm(prev => ({ ...prev, medications: [...(prev.medications || []), { ...tempMed }] }));
      setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    }

    try {
      const isNewVisit = selectedOfflineRxId && (offlineForm.consultDate !== originalConsultDate);
      const body = {
        id: isNewVisit ? undefined : (selectedOfflineRxId || undefined),
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
        alert(isNewVisit ? 'New follow-up prescription created successfully!' : (selectedOfflineRxId ? 'Offline prescription updated successfully!' : 'Offline prescription created successfully!'));
        setSelectedOfflineRxId(data.prescription.id);
        setOriginalConsultDate(data.prescription.consultDate ? data.prescription.consultDate.split('T')[0] : '');
        setOfflineForm(prev => ({ ...prev, referenceId: data.prescription.referenceId || '' }));
        fetchOfflinePrescriptions();
        return true;
      } else {
        alert(data.message || 'Failed to save offline prescription.');
        return false;
      }
    } catch (err) {
      alert('Error saving offline prescription.');
      console.error(err);
      return false;
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
    const cDate = rx.consultDate ? rx.consultDate.split('T')[0] : (rx.createdAt ? rx.createdAt.split('T')[0] : getLocalDateStr());
    setOriginalConsultDate(cDate);
    setOfflineForm({
      referenceId: rx.referenceId || '',
      patientName: rx.patientName,
      patientAge: rx.patientAge,
      patientGender: rx.patientGender,
      patientPhone: rx.patientPhone || '',
      consultDate: cDate,
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
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
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
    setOriginalConsultDate('');
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
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
    fetchNextReferenceId(true);
  };

  // Medication handlers for offline prescription form
  const addOfflineMedicationRow = () => {
    setOfflineForm(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', composition: '', dosage: '', frequency: '' }]
    }));
  };

  const removeOfflineMedicationRow = (index) => {
    if (editingOfflineMedIndex === index) {
      setEditingOfflineMedIndex(null);
      setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
    }
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

  // Start editing an added medicine
  const startEditOfflineMed = (index) => {
    const target = offlineForm.medications[index];
    if (!target) return;
    setEditingOfflineMedIndex(index);
    setEditingOfflineMed({
      name: target.name || '',
      composition: target.composition || '',
      dosage: target.dosage || '',
      frequency: target.frequency || ''
    });
  };

  // Save changes to an edited medicine
  const saveEditOfflineMed = (index) => {
    if (!editingOfflineMed.name.trim()) {
      alert('Please provide a valid Medicine Name.');
      return;
    }
    setOfflineForm(prev => {
      const updated = [...(prev.medications || [])];
      updated[index] = { ...editingOfflineMed };
      return { ...prev, medications: updated };
    });
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
  };

  // Cancel editing an added medicine
  const cancelEditOfflineMed = () => {
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
  };

  // Toggle accordion card in previous prescriptions history
  const toggleRxHistoryAccordion = (rxId) => {
    setExpandedRxHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(rxId)) {
        next.delete(rxId);
      } else {
        next.add(rxId);
      }
      return next;
    });
  };

  // Helper to compare two patient names with honorific stripping and individual identity preservation
  const isSamePatientName = (nameA, nameB) => {
    if (!nameA || !nameB) return false;

    const clean = (str) =>
      str
        .toLowerCase()
        .trim()
        .replace(/^(mr|mrs|ms|miss|dr|prof|master|baby|smt|shri)\.?\s+/i, '')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const a = clean(nameA);
    const b = clean(nameB);

    if (!a || !b) return false;
    if (a === b) return true;

    const wordsA = a.split(' ');
    const wordsB = b.split(' ');

    // If first names differ (e.g. "Ramesh" vs "Sunita"), they are DEFINITELY DIFFERENT people
    // even if they share the exact same mobile number and family surname!
    if (wordsA[0] !== wordsB[0]) {
      return false;
    }

    // If one is just first name ("Sunita") and other is full name ("Sunita Sharma")
    if (wordsA.length === 1 || wordsB.length === 1) {
      return true;
    }

    // If both are multi-word, check if last names match or if one name contains the other
    if (wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) {
      return true;
    }

    if (a.includes(b) || b.includes(a)) {
      return true;
    }

    return false;
  };

  // Get all previous prescriptions matching currently entered patient / reference
  const getPatientHistoryPrescriptions = () => {
    const currentName = (offlineForm.patientName || '').trim();
    const currentPhone = (offlineForm.patientPhone || '').trim();
    const currentRef = (offlineForm.referenceId || '').trim();

    if (!currentName && !currentRef) {
      return [];
    }

    const matched = offlineRxList.filter(rx => {
      const rxName = (rx.patientName || '').trim();
      const rxPhone = (rx.patientPhone || '').trim();
      const rxRef = (rx.referenceId || '').trim();

      // 1. If patient name is entered:
      if (currentName) {
        // Name MUST match! If names differ (e.g. Ramesh vs Sunita), they must NEVER be merged,
        // even if they share the exact same mobile number.
        if (!isSamePatientName(currentName, rxName)) {
          return false;
        }

        // If phone is provided in both, verify phone matches (or one is empty)
        if (currentPhone && rxPhone && currentPhone !== rxPhone) {
          return false;
        }

        return true;
      }

      // 2. If no name is entered yet, but a specific reference ID is entered:
      if (currentRef && rxRef) {
        const currentSerial = currentRef.split('/')[0].toLowerCase();
        const rxSerial = rxRef.split('/')[0].toLowerCase();
        return currentRef.toLowerCase() === rxRef.toLowerCase() || currentSerial === rxSerial;
      }

      return false;
    });

    matched.sort((a, b) => {
      const dateA = new Date(a.consultDate || a.createdAt || 0);
      const dateB = new Date(b.consultDate || b.createdAt || 0);
      return dateB - dateA;
    });

    return matched;
  };

  // Identify other family members who share the same mobile phone number but are distinct patients
  const otherFamilyMembersWithSamePhone = React.useMemo(() => {
    const currentPhone = (offlineForm.patientPhone || '').trim();
    const currentName = (offlineForm.patientName || '').trim();
    if (!currentPhone || !currentName) return [];

    const familyMap = new Map();
    offlineRxList.forEach(rx => {
      const rxPhone = (rx.patientPhone || '').trim();
      const rxName = (rx.patientName || '').trim();
      if (rxPhone && rxPhone === currentPhone && rxName && !isSamePatientName(currentName, rxName)) {
        const key = rxName.toLowerCase();
        if (!familyMap.has(key)) {
          familyMap.set(key, {
            name: rxName,
            age: rx.patientAge,
            gender: rx.patientGender,
            referenceId: rx.referenceId,
            latestRx: rx
          });
        }
      }
    });
    return Array.from(familyMap.values());
  }, [offlineForm.patientPhone, offlineForm.patientName, offlineRxList]);

  // Copy all medications and clinical diagnosis from past prescription into current form
  const copyAllMedsFromHistory = (rx) => {
    const meds = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || []);
    if ((!meds || meds.length === 0) && !rx.diagnosis) {
      alert('This past prescription does not contain any medications or diagnosis to copy.');
      return;
    }
    setOfflineForm(prev => ({
      ...prev,
      medications: meds && meds.length > 0 ? [...(prev.medications || []), ...meds] : (prev.medications || []),
      // Copy clinical diagnosis from past visit
      diagnosis: rx.diagnosis || prev.diagnosis || '',
      // Vitals (BP, Pulse, Weight) remain untouched and fresh for today's consultation
      bp: prev.bp || '',
      pulse: prev.pulse || '',
      weight: prev.weight || ''
    }));
    const diagMsg = rx.diagnosis ? ` and Diagnosis ("${rx.diagnosis}")` : '';
    alert(`Copied ${meds ? meds.length : 0} medicine(s)${diagMsg} into today's prescription! (BP, pulse, weight left fresh)`);
  };

  // Copy single medication from past prescription into current form
  const copySingleMedFromHistory = (med) => {
    setOfflineForm(prev => ({
      ...prev,
      medications: [...(prev.medications || []), { ...med }]
    }));
    alert(`Added "${med.name}" to current prescription!`);
  };

  // Start new follow-up visit for an old patient (1 Patient = 1 Lifetime Reference ID)
  const startNewFollowUpFromPatient = (rx) => {
    setSelectedOfflineRxId(null);
    setOriginalConsultDate('');

    setOfflineForm({
      referenceId: rx.referenceId || '', // PRESERVE LIFETIME REFERENCE ID
      patientName: rx.patientName,
      patientAge: rx.patientAge,
      patientGender: rx.patientGender,
      patientPhone: rx.patientPhone || '',
      consultDate: getLocalDateStr(),
      diagnosis: rx.diagnosis || '', // Copy clinical diagnosis for follow-up
      chiefComplaints: '',
      bp: '', // Fresh for today (do not copy past vitals)
      pulse: '', // Fresh for today (do not copy past vitals)
      weight: '', // Fresh for today (do not copy past vitals)
      medications: [],
      advice: '',
      requiredTests: '',
      followUpDate: ''
    });
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    // Expand the past visit so the doctor sees previous history immediately
    setExpandedRxHistoryIds(new Set([rx.id]));
  };

  // Helper to filter quick lookup results
  const getQuickLookupResults = () => {
    if (!quickLookupQuery.trim()) return [];
    const q = quickLookupQuery.trim().toLowerCase();
    return offlineRxList.filter(rx => {
      const ref = (rx.referenceId || '').toLowerCase();
      const name = (rx.patientName || '').toLowerCase();
      const phone = (rx.patientPhone || '').toLowerCase();
      const id = (rx.id || '').toLowerCase();
      const serialPart = ref.split('/')[0];
      return ref.includes(q) || name.includes(q) || phone.includes(q) || id.includes(q) || serialPart === q;
    }).slice(0, 12);
  };

  // Detect if manually typed reference ID matches an existing patient whose details are not yet filled
  const matchedOldPatientRecord = React.useMemo(() => {
    if (!offlineForm.referenceId || !offlineForm.referenceId.trim()) return null;
    if (selectedOfflineRxId) return null;
    const ref = offlineForm.referenceId.trim().toLowerCase();
    const found = offlineRxList.find(rx => {
      const rxRef = (rx.referenceId || '').trim().toLowerCase();
      const rxSerial = rxRef.split('/')[0];
      return (rxRef === ref || rxSerial === ref);
    });
    if (!found) return null;
    // Don't show if this patient's details are already loaded in the form
    if (offlineForm.patientName && isSamePatientName(offlineForm.patientName, found.patientName)) {
      return null;
    }
    return found;
  }, [offlineForm.referenceId, offlineForm.patientName, offlineRxList, selectedOfflineRxId]);

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
    // Only auto-fetch if we are in offline-rx mode, no existing Rx is loaded, and NO referenceId has been set yet!
    if (dashboardView === 'offline-rx' && !selectedOfflineRxId && !offlineForm.referenceId) {
      fetchNextReferenceId(false);
    }
  }, [dashboardView, token]);

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
        return;
      } else {
        setLoginError(data.message || 'Invalid email or password.');
      }
    } catch (err) {
      // Local fallback for doctor login if backend is not running locally
      const isDoctorCreds = (email.trim().toLowerCase() === 'doctor@neuroharmony.in' || !email.trim()) && (password === 'doctor123' || !password.trim());
      if (isDoctorCreds || email.trim().toLowerCase().includes('doctor')) {
        const dummyUser = {
          id: 'doc-local-session',
          name: 'Dr. Priyadarshi Srivastava',
          email: email || 'doctor@neuroharmony.in',
          role: 'DOCTOR'
        };
        const dummyToken = 'local-preview-token';
        setToken(dummyToken);
        setUser(dummyUser);
        localStorage.setItem('doc_token', dummyToken);
        localStorage.setItem('doc_user', JSON.stringify(dummyUser));
        return;
      }
      setLoginError('Error connecting to backend server. Use doctor@neuroharmony.in / doctor123 to log in.');
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
          useLetterhead: prescriptionForm.useLetterhead,
          showSignature: offlineLayout.showSignature,
          signatureSize: offlineLayout.signatureSize,
          signaturePosition: offlineLayout.signaturePosition,
          signatureXOffset: offlineLayout.signatureXOffset,
          signatureYOffset: offlineLayout.signatureYOffset,
          fontFamily: offlineLayout.fontFamily,
          fontSize: offlineLayout.fontSize
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

            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => {
                setEmail('doctor@neuroharmony.in');
                setPassword('doctor123');
              }}
              style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem' }}
            >
              ⚡ Fill Doctor Credentials
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <strong>Email:</strong> doctor@neuroharmony.in<br/>
              <strong>Password:</strong> doctor123
            </div>
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

                  {/* Past Prescriptions History for this individual patient */}
                  <div className="case-details-section">
                    <h4>Past Prescriptions & History</h4>
                    {(() => {
                      const patientPastRx = offlineRxList.filter(rx => 
                        isSamePatientName(activeVideoAppt.patientName, rx.patientName)
                      );
                      const otherFamily = offlineRxList.filter(rx => 
                        rx.patientPhone && rx.patientPhone === activeVideoAppt.patientPhone && 
                        !isSamePatientName(activeVideoAppt.patientName, rx.patientName)
                      );
                      const otherNames = Array.from(new Set(otherFamily.map(r => r.patientName)));

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {otherNames.length > 0 && (
                            <div style={{ backgroundColor: '#064e3b', border: '1px solid #059669', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#a7f3d0' }}>
                              👨‍👩‍👧 <strong>Shared Family Phone (+91 {activeVideoAppt.patientPhone}):</strong> Other registered member(s): {otherNames.join(', ')}. <em>(Clinical records strictly separated)</em>
                            </div>
                          )}

                          {patientPastRx.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>
                              No earlier prescriptions on file for {activeVideoAppt.patientName}.
                            </p>
                          ) : (
                            patientPastRx.map(prx => {
                              const pMeds = typeof prx.medications === 'string' ? JSON.parse(prx.medications) : (prx.medications || []);
                              return (
                                <div key={prx.id} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.6rem', fontSize: '0.8rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                    <strong style={{ color: '#2dd4bf' }}>{formatPrintDate(prx.consultDate || prx.createdAt)}</strong>
                                    {prx.referenceId && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ref: {prx.referenceId}</span>}
                                  </div>
                                  <div style={{ color: '#cbd5e1', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                                    <strong>Diagnosis:</strong> {prx.diagnosis}
                                  </div>
                                  {pMeds.length > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{pMeds.length} medicine(s)</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPrescriptionForm(prev => ({
                                            ...prev,
                                            medications: [...(prev.medications || []), ...pMeds],
                                            diagnosis: prx.diagnosis || prev.diagnosis || ''
                                          }));
                                          setActiveTab('presc');
                                        }}
                                        style={{ background: '#0f766e', border: 'none', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}
                                      >
                                        📋 Copy Meds & Diagnosis to Digital Rx
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })()}
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
            
            {/* Top Workspace Controls: Sidebar Toggle & Quick Patient / Serial Search Bar */}
            <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem', alignItems: 'center' }}>
              <button 
                type="button"
                onClick={() => setSidebarOpen(prev => !prev)}
                style={{
                  background: sidebarOpen ? 'var(--neutral-light)' : 'var(--primary)',
                  color: sidebarOpen ? 'var(--primary)' : 'var(--white)',
                  border: '1px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '0.6rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>☰</span> {sidebarOpen ? 'Hide Saved Rx List' : 'Show Saved Rx List'}
              </button>

              {/* Quick Patient & Serial No Search Bar */}
              <div style={{ position: 'relative', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--white)', border: '1.5px solid var(--primary)', borderRadius: '8px', padding: '0.2rem 0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '1.1rem', marginRight: '0.5rem' }}>🔍</span>
                  <input 
                    type="text" 
                    placeholder="Search Old Patient by Serial / Ref No (e.g. 58 or 58/2026), Patient Name, or Mobile..."
                    value={quickLookupQuery}
                    onChange={e => {
                      setQuickLookupQuery(e.target.value);
                      setShowQuickLookupDropdown(true);
                    }}
                    onFocus={() => setShowQuickLookupDropdown(true)}
                    style={{ border: 'none', outline: 'none', padding: '0.45rem 0', fontSize: '0.88rem', width: '100%', backgroundColor: 'transparent' }}
                  />
                  {quickLookupQuery && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setQuickLookupQuery('');
                        setShowQuickLookupDropdown(false);
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem', padding: '0 0.25rem' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {showQuickLookupDropdown && quickLookupQuery.trim() && (
                  <div className="quick-lookup-dropdown" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                      <span>Matching Patient Prescriptions ({getQuickLookupResults().length})</span>
                      <button 
                        type="button" 
                        onClick={() => setShowQuickLookupDropdown(false)}
                        style={{ background: 'transparent', border: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Close ✕
                      </button>
                    </div>

                    {getQuickLookupResults().length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        No past prescriptions found matching "{quickLookupQuery}".
                      </div>
                    ) : (
                      getQuickLookupResults().map(rx => {
                        const medCount = (typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || [])).length;
                        return (
                          <div key={rx.id} className="quick-lookup-item">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 800, color: 'var(--neutral-dark)', fontSize: '0.9rem' }}>{rx.patientName}</span>
                                {rx.referenceId && (
                                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', backgroundColor: '#ccfbf1', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                    Ref: {rx.referenceId}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>
                                {rx.patientAge} Yrs / {rx.patientGender} • {formatPrintDate(rx.consultDate || rx.createdAt)} • {medCount} Meds Prescribed
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                type="button" 
                                className="btn btn-primary"
                                onClick={() => {
                                  startNewFollowUpFromPatient(rx);
                                  setShowQuickLookupDropdown(false);
                                  setQuickLookupQuery('');
                                }}
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                title="Start a fresh follow-up visit for this patient with new Serial Ref ID"
                              >
                                ⚡ Start Today's Follow-up
                              </button>
                              <button 
                                type="button" 
                                className="btn btn-secondary"
                                onClick={() => {
                                  loadOfflinePrescription(rx);
                                  setShowQuickLookupDropdown(false);
                                  setQuickLookupQuery('');
                                  setExpandedRxHistoryIds(new Set([rx.id]));
                                }}
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                title="Load and inspect this exact past prescription"
                              >
                                📁 Open Past Rx
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
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
                    placeholder="🔍 Search by Name, Ref ID, Mobile..."
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
                          (rx.patientPhone && rx.patientPhone.toLowerCase().includes(q)) ||
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
                
                {/* Header: Edit / View Past Record vs Create New Prescription */}
                {selectedOfflineRxId ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e0f2fe', padding: '0.85rem 1.1rem', borderRadius: '8px', border: '1.5px solid #0284c7', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '0.92rem' }}>
                        📁 Viewing Past Prescription (Ref: {offlineForm.referenceId || 'N/A'})
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#0c4a6e', marginTop: '0.1rem' }}>
                        Patient: <strong>{offlineForm.patientName}</strong> ({offlineForm.patientAge} Yrs / {offlineForm.patientGender}) • Past Date: {formatPrintDate(originalConsultDate || offlineForm.consultDate)}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-primary"
                      onClick={() => {
                        const currentRx = offlineRxList.find(r => r.id === selectedOfflineRxId) || { ...offlineForm };
                        startNewFollowUpFromPatient(currentRx);
                      }}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700 }}
                      title="Start today's follow-up visit using this patient's lifetime reference ID"
                    >
                      ⚡ Start Today's Follow-up
                    </button>
                  </div>
                ) : (
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {offlineForm.patientName ? `Prescription for ${offlineForm.patientName} (Ref: ${offlineForm.referenceId})` : 'Create Offline Prescription'}
                  </h3>
                )}
                
                {/* Reference ID & Consultation Date Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Reference ID / Serial No (Auto / Editable)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 104/2026 or 58"
                      value={offlineForm.referenceId}
                      onChange={e => setOfflineForm(prev => ({ ...prev, referenceId: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Consultation Date</span>
                      <span 
                        onClick={() => setOfflineForm(prev => ({ ...prev, consultDate: getLocalDateStr() }))}
                        style={{ color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}
                      >
                        Set to Today
                      </span>
                    </label>
                    <input 
                      type="date" 
                      value={offlineForm.consultDate}
                      onChange={e => setOfflineForm(prev => ({ ...prev, consultDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Smart Match Banner only if doctor types an existing serial into a blank form */}
                {matchedOldPatientRecord && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#fef3c7',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    color: '#92400e',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    animation: 'rxSlideDown 0.2s ease-out'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>✨ Found Patient Record for Ref {matchedOldPatientRecord.referenceId}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#78350f', fontWeight: 600 }}>
                        {formatPrintDate(matchedOldPatientRecord.consultDate || matchedOldPatientRecord.createdAt)}
                      </span>
                    </div>
                    <div>
                      Patient: <strong>{matchedOldPatientRecord.patientName}</strong> ({matchedOldPatientRecord.patientAge} Yrs, {matchedOldPatientRecord.patientGender})
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button 
                        type="button" 
                        onClick={() => startNewFollowUpFromPatient(matchedOldPatientRecord)}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        ⚡ Start Today's Follow-up
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          loadOfflinePrescription(matchedOldPatientRecord);
                          setExpandedRxHistoryIds(new Set([matchedOldPatientRecord.id]));
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        📁 View Past Rx
                      </button>
                    </div>
                  </div>
                )}

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
                      placeholder="e.g. 120/80"
                      value={offlineForm.bp}
                      onChange={e => setOfflineForm(prev => ({ ...prev, bp: e.target.value }))}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && !/mmhg/i.test(val)) {
                          setOfflineForm(prev => ({ ...prev, bp: `${val} mmHg` }));
                        }
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Pulse Rate</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 72"
                      value={offlineForm.pulse}
                      onChange={e => setOfflineForm(prev => ({ ...prev, pulse: e.target.value }))}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && !/bpm/i.test(val)) {
                          setOfflineForm(prev => ({ ...prev, pulse: `${val} bpm` }));
                        }
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Weight</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 68"
                      value={offlineForm.weight}
                      onChange={e => setOfflineForm(prev => ({ ...prev, weight: e.target.value }))}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && !/kg/i.test(val)) {
                          setOfflineForm(prev => ({ ...prev, weight: `${val} kg` }));
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Chief Complaints with Compact Dropdown & Vertical Checkbox Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>
                      Chief Complaints / Patient Symptoms
                    </label>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowSymptomDrawer(!showSymptomDrawer)}
                        style={{
                          padding: '0.25rem 0.6rem',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: showSymptomDrawer ? '#0f766e' : '#f0fdfa',
                          color: showSymptomDrawer ? '#ffffff' : '#0f766e',
                          border: '1px solid #99f6e4',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>⚡</span> {showSymptomDrawer ? 'Hide Quick Symptoms' : 'Quick Symptom Checklist'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setManagerSelectedCatId(activeSymptomCat || symptomTemplates[0]?.id || 'migraine');
                          setShowSymptomManagerModal(true);
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          backgroundColor: '#f8fafc',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        title="Edit or customize symptom categories and sub-rows"
                      >
                        <span>⚙️</span> Manage Master
                      </button>
                    </div>
                  </div>

                  {/* Compact Dropdown & Vertical Checkbox List (User's Space-Saving Form) */}
                  {showSymptomDrawer && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      border: '1.5px solid #ccfbf1',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                      boxShadow: '0 2px 8px rgba(15, 118, 110, 0.08)'
                    }}>
                      {/* Top Category Dropdown Selector Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <select
                            value={activeSymptomCat || symptomTemplates[0]?.id}
                            onChange={(e) => setActiveSymptomCat(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: '#0f766e',
                              borderRadius: '6px',
                              border: '1.5px solid #0f766e',
                              backgroundColor: '#ffffff',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            {symptomTemplates.map(cat => (
                              <option key={cat.id} value={cat.id}>
                                {cat.icon || '📋'} {cat.category} ({cat.symptoms.length} symptoms)
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Category Edit, Delete & Add Actions */}
                        {(() => {
                          const currentCat = symptomTemplates.find(c => c.id === (activeSymptomCat || symptomTemplates[0]?.id));
                          if (!currentCat) return null;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const newName = prompt('Edit category name:', currentCat.category);
                                  if (newName && newName.trim()) {
                                    editCategoryRow(currentCat.id, newName.trim(), currentCat.icon);
                                  }
                                }}
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px', cursor: 'pointer', color: '#0f766e', fontWeight: 600 }}
                                title="Rename this category"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCategoryRow(currentCat.id)}
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px', cursor: 'pointer', color: '#e11d48', fontWeight: 600 }}
                                title="Delete this category"
                              >
                                🗑️
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const name = prompt('Enter new category name (e.g. ADHD, Epilepsy, Dementia):');
                                  if (name && name.trim()) {
                                    addCategoryRow(name.trim(), '🧠');
                                  }
                                }}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', backgroundColor: '#f0fdfa', border: '1px dashed #0f766e', borderRadius: '5px', cursor: 'pointer', color: '#0f766e', fontWeight: 700 }}
                                title="Add a new category"
                              >
                                ➕ New Row
                              </button>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Vertical Sub-Rows Checkbox List (Exact Sketch Format) */}
                      {(() => {
                        const currentCat = symptomTemplates.find(c => c.id === (activeSymptomCat || symptomTemplates[0]?.id));
                        if (!currentCat) return null;

                        return (
                          <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                              {currentCat.symptoms.length === 0 ? (
                                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                  No symptoms under {currentCat.category} yet. Type below to add.
                                </div>
                              ) : (
                                currentCat.symptoms.map((sym, sIdx) => {
                                  const checked = isSymptomChecked(sym);
                                  return (
                                    <div
                                      key={sIdx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.4rem 0.65rem',
                                        borderBottom: '1px solid #f1f5f9',
                                        backgroundColor: checked ? '#f0fdfa' : '#ffffff',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.1s ease'
                                      }}
                                      onClick={() => toggleSymptom(sym)}
                                    >
                                      {/* Left side: Checkbox + Symptom Text */}
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', flex: 1, margin: 0 }}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {}} // handled by parent onClick
                                          style={{ width: '15px', height: '15px', accentColor: '#0f766e', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.8rem', fontWeight: checked ? 700 : 500, color: checked ? '#0f766e' : '#1e293b' }}>
                                          {sym}
                                        </span>
                                      </label>

                                      {/* Right side: Edit & Delete buttons */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newText = prompt('Edit symptom text:', sym);
                                            if (newText && newText.trim()) {
                                              editSymptomSubRow(currentCat.id, sym, newText.trim());
                                            }
                                          }}
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#64748b', padding: '0.1rem 0.25rem' }}
                                          title="Edit wording"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (window.confirm(`Delete "${sym}" from ${currentCat.category}?`)) {
                                              deleteSymptomSubRow(currentCat.id, sym);
                                            }
                                          }}
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#e11d48', padding: '0.1rem 0.25rem' }}
                                          title="Delete symptom"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Add New Sub-Row Form */}
                            <div style={{ display: 'flex', padding: '0.4rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', gap: '0.35rem' }}>
                              <input
                                type="text"
                                placeholder={`+ Add symptom under ${currentCat.category}...`}
                                id={`compact-sym-input-${currentCat.id}`}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = e.target.value.trim();
                                    if (val) {
                                      addSymptomSubRow(currentCat.id, val);
                                      e.target.value = '';
                                    }
                                  }
                                }}
                                style={{ flex: 1, padding: '0.28rem 0.5rem', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.getElementById(`compact-sym-input-${currentCat.id}`);
                                  if (input && input.value.trim()) {
                                    addSymptomSubRow(currentCat.id, input.value.trim());
                                    input.value = '';
                                  }
                                }}
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#0f766e', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                ➕ Add
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <textarea 
                    placeholder="e.g. High pulse, palpitations, heaviness in head (Click 'Quick Symptom Checklist' above to tick symptoms with 1 click)"
                    rows="3"
                    value={offlineForm.chiefComplaints}
                    onChange={e => setOfflineForm(prev => ({ ...prev, chiefComplaints: e.target.value }))}
                    style={{ lineHeight: 1.5 }}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>
                          Added Medicines ({offlineForm.medications.length})
                        </label>
                        <span style={{ fontSize: '0.72rem', color: 'var(--neutral-body)' }}>
                          Click ✏️ Edit to modify any medicine
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {offlineForm.medications.map((med, index) => {
                          const isEditingThis = editingOfflineMedIndex === index;

                          if (isEditingThis) {
                            return (
                              <div 
                                key={index}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.6rem',
                                  padding: '0.85rem',
                                  backgroundColor: '#f0fdfa',
                                  border: '2px solid var(--primary)',
                                  borderRadius: '8px',
                                  boxShadow: '0 2px 8px rgba(15, 118, 110, 0.15)',
                                  animation: 'rxSlideDown 0.15s ease-out'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccfbf1', paddingBottom: '0.4rem' }}>
                                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span>✏️</span> Editing Medicine #{index + 1}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', color: '#0f766e', fontStyle: 'italic' }}>
                                    Update details below and click Save
                                  </span>
                                </div>

                                {/* Name & Composition inputs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Medicine Name *</label>
                                    <input 
                                      type="text" 
                                      placeholder="Medicine Name"
                                      value={editingOfflineMed.name}
                                      onChange={e => setEditingOfflineMed(prev => ({ ...prev, name: e.target.value }))}
                                      style={{ width: '100%', padding: '0.4rem 0.55rem', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--neutral-border)', boxSizing: 'border-box' }}
                                      required
                                      autoFocus
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Composition (Optional)</label>
                                    <input 
                                      type="text" 
                                      placeholder="Generic Composition"
                                      value={editingOfflineMed.composition}
                                      onChange={e => setEditingOfflineMed(prev => ({ ...prev, composition: e.target.value }))}
                                      style={{ width: '100%', padding: '0.4rem 0.55rem', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--neutral-border)', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                </div>

                                {/* Dosage & Frequency inputs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Dosage (Optional)</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. 1 Tablet"
                                      value={editingOfflineMed.dosage}
                                      onChange={e => setEditingOfflineMed(prev => ({ ...prev, dosage: e.target.value }))}
                                      style={{ width: '100%', padding: '0.4rem 0.55rem', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--neutral-border)', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Frequency & Instructions</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. 1-0-1 (after meals)"
                                      value={editingOfflineMed.frequency}
                                      onChange={e => setEditingOfflineMed(prev => ({ ...prev, frequency: e.target.value }))}
                                      style={{ width: '100%', padding: '0.4rem 0.55rem', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--neutral-border)', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                </div>

                                {/* Save / Cancel Action Buttons */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  <button
                                    type="button"
                                    onClick={cancelEditOfflineMed}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.78rem' }}
                                  >
                                    ✕ Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveEditOfflineMed(index)}
                                    className="btn btn-primary"
                                    style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', fontWeight: 700 }}
                                  >
                                    ✓ Save Changes
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div 
                              key={index}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.6rem 0.85rem',
                                backgroundColor: 'var(--neutral-light)',
                                border: '1px solid var(--neutral-border)',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: '0.5rem' }}>
                                <span style={{ fontWeight: 800, color: 'var(--neutral-dark)', fontSize: '0.88rem' }}>
                                  {index + 1}. {med.name}
                                </span>
                                {(med.composition || med.dosage || med.frequency) && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--neutral-body)', marginTop: '0.15rem' }}>
                                    {med.composition ? (
                                      <span style={{ color: '#b91c1c', fontStyle: 'italic', fontWeight: 600 }}>({med.composition})</span>
                                    ) : null}
                                    {med.dosage ? ` • ${med.dosage}` : ''} 
                                    {med.frequency ? ` • ${med.frequency}` : ''}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  onClick={() => startEditOfflineMed(index)}
                                  style={{
                                    background: '#0f766e',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '0.3rem 0.65rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                  }}
                                  title="Edit this medicine's name, composition, dosage, or frequency"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeOfflineMedicationRow(index)}
                                  style={{
                                    background: '#fff',
                                    border: '1px solid #fca5a5',
                                    color: 'var(--danger)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.8rem'
                                  }}
                                  title="Remove from Prescription"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                    className="btn btn-secondary" 
                    onClick={() => {
                      setShowAnalyticsModal(true);
                      fetchOverviewAnalytics(analyticsTimeframe);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}
                    title="Open Clinical Research & Prescription Analytics"
                  >
                    🔬 Research & Analytics
                  </button>
                </div>
                
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={async () => {
                    const success = await saveOfflinePrescription();
                    if (success) {
                      setTimeout(() => {
                        window.print();
                      }, 100);
                    }
                  }}
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Font Family</span>
                      </label>
                      
                      {/* Searchable Dropdown Trigger */}
                      <button 
                        type="button"
                        onClick={() => setShowFontDropdown(!showFontDropdown)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.8rem',
                          borderRadius: '6px',
                          border: '1px solid var(--neutral-border)',
                          backgroundColor: 'var(--white)',
                          color: 'var(--neutral-dark)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          fontWeight: 600
                        }}
                      >
                        <span>{offlineLayout.fontFamily || 'Plus Jakarta Sans'}</span>
                        <span style={{ fontSize: '0.6rem', color: '#64748b' }}>▼</span>
                      </button>

                      {/* Dropdown Box overlay */}
                      {showFontDropdown && (
                        <div 
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            zIndex: 1000,
                            marginTop: '4px',
                            backgroundColor: 'var(--white)',
                            border: '1px solid var(--neutral-border)',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                            padding: '0.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            maxHeight: '260px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--neutral-border)', borderRadius: '6px', padding: '0.25rem 0.5rem', backgroundColor: '#f8fafc' }}>
                            <span style={{ fontSize: '0.8rem', marginRight: '0.25rem' }}>🔍</span>
                            <input 
                              type="text" 
                              placeholder="Search fonts..." 
                              value={fontSearchQuery}
                              onChange={e => setFontSearchQuery(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                width: '100%',
                                fontSize: '0.8rem',
                                color: 'var(--neutral-dark)',
                                outline: 'none',
                                padding: 0
                              }}
                            />
                          </div>

                          <div 
                            style={{ 
                              overflowY: 'auto', 
                              flex: 1, 
                              display: 'flex', 
                              flexDirection: 'column',
                              gap: '2px'
                            }}
                          >
                            {ALL_FONTS.filter(f => f.name.toLowerCase().includes(fontSearchQuery.toLowerCase())).map(f => (
                              <button
                                key={f.name}
                                type="button"
                                onClick={() => {
                                  localStorage.setItem('fontFamilyOffline', f.name);
                                  setOfflineLayout(prev => ({ ...prev, fontFamily: f.name }));
                                  setShowFontDropdown(false);
                                  setFontSearchQuery('');
                                }}
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  fontSize: '0.8rem',
                                  border: 'none',
                                  borderRadius: '4px',
                                  background: offlineLayout.fontFamily === f.name ? '#e0f2fe' : 'transparent',
                                  color: offlineLayout.fontFamily === f.name ? '#0369a1' : 'var(--neutral-dark)',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontFamily: f.name === 'Georgia' || f.name === 'Courier New' ? f.name : 'inherit',
                                  fontWeight: offlineLayout.fontFamily === f.name ? 700 : 'normal',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <span>{f.name}</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{f.category}</span>
                              </button>
                            ))}
                            {ALL_FONTS.filter(f => f.name.toLowerCase().includes(fontSearchQuery.toLowerCase())).length === 0 && (
                              <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                                No matching fonts found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
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

                    {/* Signature Settings Divider */}
                    <div style={{ gridColumn: 'span 2', height: '1px', backgroundColor: 'var(--neutral-border)', margin: '0.5rem 0' }}></div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: 'span 2' }}>
                      <input 
                        type="checkbox" 
                        id="show-signature-offline" 
                        checked={offlineLayout.showSignature} 
                        onChange={e => {
                          const val = e.target.checked;
                          localStorage.setItem('showSignatureOffline', val ? 'true' : 'false');
                          setOfflineLayout(prev => ({ ...prev, showSignature: val }));
                        }}
                        style={{ cursor: 'pointer', width: 'auto' }}
                      />
                      <label htmlFor="show-signature-offline" style={{ fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                        Apply Signature Logo
                      </label>
                    </div>

                    {offlineLayout.showSignature && (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Signature Size</span>
                            <span>{offlineLayout.signatureSize}px</span>
                          </label>
                          <input 
                            type="range" 
                            min="120" 
                            max="350" 
                            value={offlineLayout.signatureSize} 
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              localStorage.setItem('signatureSizeOffline', val.toString());
                              setOfflineLayout(prev => ({ ...prev, signatureSize: val }));
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Signature Position</span>
                          </label>
                          <select
                            value={offlineLayout.signaturePosition}
                            onChange={e => {
                              const val = e.target.value;
                              localStorage.setItem('signaturePositionOffline', val);
                              setOfflineLayout(prev => ({ ...prev, signaturePosition: val }));
                            }}
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--neutral-border)', backgroundColor: 'var(--white)', color: 'var(--neutral-dark)', cursor: 'pointer' }}
                          >
                            <option value="inline">Inline (Below Advice/Notes)</option>
                            <option value="bottom">Fixed Bottom Left</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Signature Shift (Left / Right)</span>
                            <span>{offlineLayout.signatureXOffset}px</span>
                          </label>
                          <input 
                            type="range" 
                            min="-100" 
                            max="400" 
                            value={offlineLayout.signatureXOffset} 
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              localStorage.setItem('signatureXOffsetOffline', val.toString());
                              setOfflineLayout(prev => ({ ...prev, signatureXOffset: val }));
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Signature Shift (Up / Down)</span>
                            <span>{offlineLayout.signatureYOffset}px</span>
                          </label>
                          <input 
                            type="range" 
                            min="-150" 
                            max="150" 
                            value={offlineLayout.signatureYOffset} 
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              localStorage.setItem('signatureYOffsetOffline', val.toString());
                              setOfflineLayout(prev => ({ ...prev, signatureYOffset: val }));
                            }}
                          />
                        </div>
                      </>
                    )}

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
                      fontFamily: offlineLayout.fontFamily || 'Plus Jakarta Sans',
                      position: 'relative',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      {/* Premium Letterhead Header */}
                      {!offlineLayout.useLetterhead && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '2px solid #0f766e', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.45em', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: offlineLayout.fontFamily || 'Plus Jakarta Sans' }}>MENTAL WELLNESS CLINIC</div>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.05fr 1.05fr 1.05fr 1fr', gap: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.82em', marginBottom: '1rem', backgroundColor: '#f8fafc', alignItems: 'center' }}>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>PATIENT NAME</strong></div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.02em', marginTop: '0.1rem', wordBreak: 'break-word' }}>{offlineForm.patientName || '__________________'}</div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>AGE / GENDER</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '0.95em', marginTop: '0.1rem' }}>
                            {offlineForm.patientAge ? `${offlineForm.patientAge} Yrs` : '___ Yrs'} / {offlineForm.patientGender}
                          </div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>PHONE NUMBER</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '0.95em', marginTop: '0.1rem' }}>{offlineForm.patientPhone || '__________________'}</div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>DATE OF CONSULTATION</strong></div>
                          <div style={{ color: '#1e293b', fontSize: '0.95em', marginTop: '0.1rem' }}>
                            {formatPrintDate(offlineForm.consultDate)}
                          </div>
                        </div>
                        <div>
                          <div><strong style={{ color: '#64748b', fontSize: '0.72em' }}>RX ID / REFERENCE</strong></div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95em', marginTop: '0.1rem' }}>
                            {offlineForm.referenceId || (selectedOfflineRxId ? `OFF-RX-${selectedOfflineRxId.slice(0, 8).toUpperCase()}` : 'OFFLINE-NEW')}
                          </div>
                        </div>
                      </div>

                      {/* Side-by-Side Content Layout below Patient Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', marginTop: '1rem', alignItems: 'start' }}>
                        
                        {/* Left Column: Vitals (if recorded), Chief Complaints, Diagnosis & Clinical Notes, Tests & General Advice */}
                        <div style={{ borderRight: '1px solid #cbd5e1', paddingRight: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '300px' }}>
                          
                          {/* 0. Vitals Card (BP, Pulse, Weight) - Only rendered when doctor writes them */}
                          {(Boolean(offlineForm.bp && offlineForm.bp.trim()) || Boolean(offlineForm.pulse && offlineForm.pulse.trim()) || Boolean(offlineForm.weight && offlineForm.weight.trim())) && (
                            <div>
                              <div style={{ fontSize: '0.75em', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>VITALS</div>
                              <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ width: '4px', backgroundColor: '#e11d48' }}></div>
                                <div style={{ flex: 1, padding: '0.5rem 0.75rem', backgroundColor: '#f8fafc', fontSize: '0.84em', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                  {offlineForm.bp && offlineForm.bp.trim() && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.78em' }}>BLOOD PRESSURE</span>
                                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatBP(offlineForm.bp)}</span>
                                    </div>
                                  )}
                                  {offlineForm.pulse && offlineForm.pulse.trim() && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.78em' }}>PULSE RATE</span>
                                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatPulse(offlineForm.pulse)}</span>
                                    </div>
                                  )}
                                  {offlineForm.weight && offlineForm.weight.trim() && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.78em' }}>WEIGHT</span>
                                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatWeight(offlineForm.weight)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

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

                          {/* Signature block printed dynamically just below general advice / notes */}
                          {offlineLayout.showSignature && offlineLayout.signaturePosition === 'inline' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '1.25rem' }}>
                              <img 
                                src="/signature.png" 
                                alt="Dr. Priyadarshi Srivastava Signature" 
                                style={{ 
                                  width: `${offlineLayout.signatureSize}px`, 
                                  height: 'auto', 
                                  mixBlendMode: 'multiply',
                                  display: 'block',
                                  transform: `translate(${offlineLayout.signatureXOffset}px, ${offlineLayout.signatureYOffset}px)`,
                                  position: 'relative'
                                }} 
                              />
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
                    <div style={{ marginTop: '1.5rem', width: '100%' }}>
                      {offlineLayout.showSignature && offlineLayout.signaturePosition === 'bottom' && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1rem' }}>
                          <img 
                            src="/signature.png" 
                            alt="Dr. Priyadarshi Srivastava Signature" 
                            style={{ 
                              width: `${offlineLayout.signatureSize}px`, 
                              height: 'auto', 
                              mixBlendMode: 'multiply',
                              display: 'block',
                              transform: `translate(${offlineLayout.signatureXOffset}px, ${offlineLayout.signatureYOffset}px)`,
                              position: 'relative'
                            }} 
                          />
                        </div>
                      )}
                      {!offlineLayout.useLetterhead && (
                        <div style={{ textAlign: 'center', fontSize: '0.65em', color: '#94a3b8', width: '100%', lineHeight: 1.3 }}>
                          This is a digitally generated secure e-Prescription. Valid without physical signature.
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Previous Prescriptions History Accordion (Rendered directly beneath Printable Prescription Sheet) */}
                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                  
                  {/* Section Title & Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📁</span> Patient Previous Prescriptions History
                      </h4>
                      {getPatientHistoryPrescriptions().length > 0 && (
                        <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}>
                          {getPatientHistoryPrescriptions().length} {getPatientHistoryPrescriptions().length === 1 ? 'Visit' : 'Visits'} Recorded
                        </span>
                      )}
                    </div>

                    {getPatientHistoryPrescriptions().length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (expandedRxHistoryIds.size === getPatientHistoryPrescriptions().length) {
                            setExpandedRxHistoryIds(new Set());
                          } else {
                            setExpandedRxHistoryIds(new Set(getPatientHistoryPrescriptions().map(r => r.id)));
                          }
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        {expandedRxHistoryIds.size === getPatientHistoryPrescriptions().length ? 'Collapse All ▲' : 'Expand All ▼'}
                      </button>
                    )}
                  </div>

                  {/* Shared Family Mobile Awareness Banner */}
                  {otherFamilyMembersWithSamePhone.length > 0 && (
                    <div style={{
                      backgroundColor: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: '8px',
                      padding: '0.65rem 0.9rem',
                      fontSize: '0.82rem',
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>👨‍👩‍👧</span>
                        <div>
                          <div>
                            <strong>Shared Family Phone ({offlineForm.patientPhone}):</strong> {otherFamilyMembersWithSamePhone.length} other registered family {otherFamilyMembersWithSamePhone.length === 1 ? 'member' : 'members'}:{' '}
                            {otherFamilyMembersWithSamePhone.map((fm, idx) => (
                              <span key={fm.name} style={{ fontWeight: 700 }}>
                                {fm.name} ({fm.age} Yrs / {fm.gender}){idx < otherFamilyMembersWithSamePhone.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#15803d', fontStyle: 'italic', marginTop: '0.1rem' }}>
                            ✓ Prescriptions & past medical history are kept strictly separated for each individual.
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {otherFamilyMembersWithSamePhone.map(fm => (
                          <button
                            key={fm.name}
                            type="button"
                            onClick={() => {
                              loadOfflinePrescription(fm.latestRx);
                              setExpandedRxHistoryIds(new Set([fm.latestRx.id]));
                            }}
                            style={{
                              backgroundColor: '#dcfce7',
                              border: '1px solid #4ade80',
                              color: '#15803d',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                            title={`Switch view to ${fm.name}'s prescription records`}
                          >
                            <span>👤</span> Switch to {fm.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Accordion Cards List */}
                  {getPatientHistoryPrescriptions().length === 0 ? (
                    <div style={{ padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
                      <strong>No past prescription records found for {offlineForm.patientName ? `"${offlineForm.patientName}"` : 'this patient'}.</strong>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                        When you create and save prescriptions for this patient, all earlier consultations will automatically appear here as collapsible history cards.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {getPatientHistoryPrescriptions().map((histRx, idx) => {
                        const isExpanded = expandedRxHistoryIds.has(histRx.id);
                        const isCurrentActive = selectedOfflineRxId === histRx.id;
                        const histMeds = typeof histRx.medications === 'string' ? JSON.parse(histRx.medications) : (histRx.medications || []);
                        const consultDateFormatted = formatPrintDate(histRx.consultDate || histRx.createdAt);

                        return (
                          <div key={histRx.id} className="rx-history-card">
                            
                            {/* Accordion Header Row (Matching user drawing: previous date | refrence no | ^) */}
                            <div 
                              className={`rx-history-header ${isExpanded ? 'active' : ''}`}
                              onClick={() => toggleRxHistoryAccordion(histRx.id)}
                            >
                              {/* Left: Previous Date */}
                              <div className="rx-history-date">
                                <span>📅</span>
                                <span>{consultDateFormatted}</span>
                                {isCurrentActive && (
                                  <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', marginLeft: '0.25rem' }}>
                                    Active in Editor
                                  </span>
                                )}
                              </div>

                              {/* Center: Reference Number */}
                              <div className="rx-history-ref">
                                {histRx.referenceId ? `Ref: ${histRx.referenceId}` : `Ref: OFF-RX-${histRx.id.slice(0, 6).toUpperCase()}`}
                              </div>

                              {/* Right: Expand/Collapse Arrow */}
                              <div className="rx-history-arrow-btn">
                                <span style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)', display: 'inline-block', transition: 'transform 0.2s ease' }}>
                                  ▲
                                </span>
                              </div>
                            </div>

                            {/* Accordion Body: Details & Interactive Actions */}
                            {isExpanded && (
                              <div className="rx-history-body">
                                
                                {/* Header Action Toolbar */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                                    <strong>{histRx.patientName}</strong> ({histRx.patientAge} Yrs / {histRx.patientGender}) {histRx.patientPhone ? `• 📞 ${histRx.patientPhone}` : ''}
                                  </div>

                                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {histMeds.length > 0 && (
                                      <button 
                                        type="button" 
                                        onClick={() => copyAllMedsFromHistory(histRx)}
                                        className="btn btn-primary"
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                        title="Copy all prescribed medicines from this past visit directly to today's prescription"
                                      >
                                        📋 Copy All Meds to Today's Rx
                                      </button>
                                    )}
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        loadOfflinePrescription(histRx);
                                      }}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                      title="Open this past prescription in form"
                                    >
                                      ✏️ Open in Editor
                                    </button>
                                  </div>
                                </div>

                                {/* Vitals & Clinical Overview */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', backgroundColor: '#ffffff', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                                  <div><span style={{ color: '#64748b' }}>BP:</span> <strong style={{ color: '#1e293b' }}>{histRx.bp ? formatBP(histRx.bp) : '—'}</strong></div>
                                  <div><span style={{ color: '#64748b' }}>Pulse:</span> <strong style={{ color: '#1e293b' }}>{histRx.pulse ? formatPulse(histRx.pulse) : '—'}</strong></div>
                                  <div><span style={{ color: '#64748b' }}>Weight:</span> <strong style={{ color: '#1e293b' }}>{histRx.weight ? formatWeight(histRx.weight) : '—'}</strong></div>
                                  <div><span style={{ color: '#64748b' }}>Visit Date:</span> <strong style={{ color: '#1e293b' }}>{consultDateFormatted}</strong></div>
                                </div>

                                {/* Chief Complaints & Diagnosis */}
                                <div style={{ display: 'grid', gridTemplateColumns: histRx.chiefComplaints ? '1fr 1fr' : '1fr', gap: '0.75rem', fontSize: '0.82rem' }}>
                                  {histRx.chiefComplaints && (
                                    <div style={{ backgroundColor: '#ffffff', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Chief Complaints</div>
                                      <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{histRx.chiefComplaints}</div>
                                    </div>
                                  )}
                                  <div style={{ backgroundColor: '#ffffff', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Diagnosis Notes</div>
                                    <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{histRx.diagnosis || 'No clinical diagnosis recorded.'}</div>
                                  </div>
                                </div>

                                {/* Prescribed Medications Table */}
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <strong style={{ fontSize: '0.82rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{ color: '#0f766e', fontWeight: 'bold' }}>℞</span> Prescribed Medicines ({histMeds.length})
                                    </strong>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Click "+ Add" to import individual medicine</span>
                                  </div>

                                  {histMeds.length === 0 ? (
                                    <div style={{ fontStyle: 'italic', fontSize: '0.8rem', color: '#94a3b8', padding: '0.5rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      No medicines were prescribed in this visit.
                                    </div>
                                  ) : (
                                    <div style={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '0.4rem 0.6rem', fontWeight: 800 }}>Medicine & Composition</th>
                                            <th style={{ padding: '0.4rem 0.6rem', fontWeight: 800 }}>Dosage</th>
                                            <th style={{ padding: '0.4rem 0.6rem', fontWeight: 800 }}>Instructions</th>
                                            <th style={{ padding: '0.4rem 0.6rem', fontWeight: 800, textAlign: 'right' }}>Action</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {histMeds.map((m, mIdx) => (
                                            <tr key={mIdx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: mIdx % 2 === 1 ? '#fafafa' : '#fff' }}>
                                              <td style={{ padding: '0.45rem 0.6rem', color: '#1e293b' }}>
                                                <div style={{ fontWeight: 800 }}>{mIdx + 1}. {m.name}</div>
                                                {m.composition && m.composition.trim() && (
                                                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic', fontWeight: 600, marginTop: '0.1rem' }}>
                                                    ({m.composition.trim()})
                                                  </div>
                                                )}
                                              </td>
                                              <td style={{ padding: '0.45rem 0.6rem', color: '#334155' }}>{m.dosage || '—'}</td>
                                              <td style={{ padding: '0.45rem 0.6rem', color: '#334155' }}>{m.frequency || '—'}</td>
                                              <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                                                <button
                                                  type="button"
                                                  onClick={() => copySingleMedFromHistory(m)}
                                                  className="btn btn-secondary"
                                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderRadius: '4px' }}
                                                  title={`Add ${m.name} to current prescription`}
                                                >
                                                  ➕ Add
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>

                                {/* Tests & Advice if available */}
                                {(histRx.requiredTests || histRx.advice) && (
                                  <div style={{ display: 'grid', gridTemplateColumns: (histRx.requiredTests && histRx.advice) ? '1fr 1fr' : '1fr', gap: '0.75rem', fontSize: '0.8rem' }}>
                                    {histRx.requiredTests && (
                                      <div style={{ backgroundColor: '#fff7ed', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                                        <strong style={{ color: '#ea580c', display: 'block', marginBottom: '0.2rem' }}>Required Tests:</strong>
                                        <div style={{ color: '#7c2d12', whiteSpace: 'pre-wrap' }}>{histRx.requiredTests}</div>
                                      </div>
                                    )}
                                    {histRx.advice && (
                                      <div style={{ backgroundColor: '#f0fdfa', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                                        <strong style={{ color: '#0d9488', display: 'block', marginBottom: '0.2rem' }}>Advice Given:</strong>
                                        <div style={{ color: '#134e4a', whiteSpace: 'pre-wrap' }}>{histRx.advice}</div>
                                      </div>
                                    )}
                                  </div>
                                )}

                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}

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

      {/* =========================================================================
          CLINICAL RESEARCH & MEDICINE ANALYTICS MODAL
          ========================================================================= */}
      {showAnalyticsModal && (
        <div className="analytics-modal-overlay">
          <div className="analytics-modal-window">
            
            {/* Modal Header */}
            <div className="analytics-modal-header">
              <div>
                <h3>
                  <span>🔬</span> Clinical Research & Prescription Analytics
                </h3>
                <p>Patient volume, prescription patterns, dosage & demographic histograms</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Timeframe Selector */}
                <select
                  value={analyticsTimeframe}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnalyticsTimeframe(val);
                    if (analyticsTab === 'overview') {
                      fetchOverviewAnalytics(val);
                    } else if (searchedMedicine) {
                      fetchMedicineAnalytics(searchedMedicine, val);
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ color: '#000' }}>📅 All Time</option>
                  <option value="30days" style={{ color: '#000' }}>📅 Last 30 Days</option>
                  <option value="90days" style={{ color: '#000' }}>📅 Last 90 Days</option>
                  <option value="1year" style={{ color: '#000' }}>📅 Past 1 Year</option>
                </select>

                {/* Export CSV Button */}
                <button
                  type="button"
                  onClick={exportAnalyticsCSV}
                  className="btn"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Export clinical data to CSV"
                >
                  📥 Export CSV
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowAnalyticsModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="analytics-tab-bar">
              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'overview' ? 'active' : ''}`}
                onClick={() => {
                  setAnalyticsTab('overview');
                  if (!overviewAnalytics) fetchOverviewAnalytics(analyticsTimeframe);
                }}
              >
                📊 Clinic Overview
              </button>

              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'medicine' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('medicine')}
              >
                🔬 Composition Research & Usage
              </button>

              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'volume' ? 'active' : ''}`}
                onClick={() => {
                  setAnalyticsTab('volume');
                  if (!patientVolumeData) fetchPatientVolumeAnalytics();
                }}
              >
                📅 Practice & Patient Volume (Daily/Monthly)
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="analytics-modal-body">
              {analyticsLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div className="rzp-spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                  <p style={{ color: 'var(--neutral-body)', fontWeight: 600 }}>Analyzing practice patient volume...</p>
                </div>
              ) : analyticsTab === 'overview' ? (
                /* =================== TAB 1: CLINIC OVERVIEW =================== */
                <>
                  {overviewAnalytics && (
                    <>
                      {/* KPI Summary Cards */}
                      <div className="analytics-kpi-grid">
                        <div className="analytics-kpi-card teal">
                          <span className="kpi-label">Total Prescriptions</span>
                          <span className="kpi-val">{overviewAnalytics.totalPrescriptions}</span>
                          <span className="kpi-sub">{overviewAnalytics.offlineCount} Clinic • {overviewAnalytics.onlineCount} Telehealth</span>
                        </div>

                        <div className="analytics-kpi-card blue">
                          <span className="kpi-label">Unique Patients Treated</span>
                          <span className="kpi-val">{overviewAnalytics.totalUniquePatients}</span>
                          <span className="kpi-sub">Across All Consultations</span>
                        </div>

                        <div className="analytics-kpi-card purple">
                          <span className="kpi-label">Unique Drugs Prescribed</span>
                          <span className="kpi-val">{overviewAnalytics.totalUniqueMedicines}</span>
                          <span className="kpi-sub">Active Formulations in DB</span>
                        </div>

                        <div className="analytics-kpi-card amber">
                          <span className="kpi-label">Diagnoses Identified</span>
                          <span className="kpi-val">
                            {(overviewAnalytics.topDiagnoses || []).length}
                          </span>
                          <span className="kpi-sub">Distinct Clinical Categories</span>
                        </div>
                      </div>

                      {/* Two Column Section: Top Medicines & Top Diagnoses */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Top Medicines Ranking */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🏆 Top Prescribed Medicines Ranking</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sorted by patient volume</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto' }}>
                            {(overviewAnalytics.topMedicines || []).map((med, idx) => (
                              <div key={idx} className="ranked-med-item">
                                <div className="ranked-med-rank">{idx + 1}</div>
                                <div className="ranked-med-info">
                                  <span className="ranked-med-name">{med.name}</span>
                                  {med.composition && <span className="ranked-med-comp">{med.composition}</span>}
                                </div>
                                <div className="ranked-med-stats">
                                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>
                                    {med.patientCount} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>patients</span>
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>
                                    {med.prescriptionCount} Prescriptions
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    fetchMedicineAnalytics(med.composition || med.name);
                                    setAnalyticsTab('medicine');
                                  }}
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}
                                  title="Analyze this composition"
                                >
                                  🔬 Analyze
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Diagnoses Correlation */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🩺 Clinical Diagnosis Distribution</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Diagnostic prevalence</span>
                          </div>

                          <div className="histogram-list">
                            {(overviewAnalytics.topDiagnoses || []).map((diag, idx) => (
                              <div key={idx} className="histogram-row">
                                <div className="histogram-row-header">
                                  <span>{diag.name}</span>
                                  <span style={{ color: '#0f766e', fontWeight: 700 }}>{diag.count} cases ({diag.percentage}%)</span>
                                </div>
                                <div className="histogram-bar-track">
                                  <div className="histogram-bar-fill blue" style={{ width: `${Math.max(5, diag.percentage)}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      {/* Monthly Timeline Overview (if available) */}
                      {overviewAnalytics.monthlyTrends?.length > 0 && (
                        <div className="analytics-panel" style={{ marginTop: '1.25rem' }}>
                          <div className="analytics-panel-header">
                            <h4>📈 Monthly Prescription Volume Trend</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Consultations per month</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: '90px', padding: '0.75rem 0.5rem 0.25rem' }}>
                            {overviewAnalytics.monthlyTrends.map((t, idx) => {
                              const maxCount = Math.max(...overviewAnalytics.monthlyTrends.map(x => x.count), 1);
                              const heightPct = Math.round((t.count / maxCount) * 100);
                              return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{t.count}</span>
                                  <div style={{ width: '100%', height: `${Math.max(12, heightPct)}%`, backgroundColor: '#0f766e', borderRadius: '4px' }} title={`${t.month}: ${t.count} Rx`}></div>
                                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{t.month}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : analyticsTab === 'medicine' ? (
                /* =================== TAB 2: ACTIVE COMPOSITION RESEARCH & PATIENT USAGE =================== */
                <>
                  {/* Active Composition Search Box */}
                  <div className="analytics-panel" style={{ padding: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        🔬 Search Active Drug Composition Only
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Single composition matching (excludes combos)
                      </span>
                    </div>

                    <div className="med-analytics-search-wrap">
                      <svg className="med-analytics-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input
                        type="text"
                        className="med-analytics-search-input"
                        placeholder="Search active composition (e.g. Sertraline, Clonazepam, Escitalopram, Paracetamol, Olanzapine)..."
                        value={medSearchInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedSearchInput(val);
                          if (val.trim().length >= 2) {
                            const searchLower = val.toLowerCase().trim();
                            const matches = getDistinctCompositions().filter(c => c.toLowerCase().includes(searchLower));
                            setMedSearchSuggestions(matches);
                          } else {
                            setMedSearchSuggestions([]);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && medSearchInput.trim()) {
                            fetchMedicineAnalytics(medSearchInput);
                            setMedSearchSuggestions([]);
                          }
                        }}
                      />
                    </div>

                    {/* Auto-suggestions Dropdown */}
                    {medSearchSuggestions.length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {medSearchSuggestions.map((comp, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              fetchMedicineAnalytics(comp);
                              setMedSearchInput(comp);
                              setMedSearchSuggestions([]);
                            }}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            className="suggestion-row"
                          >
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f766e' }}>🔬 {comp}</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Composition</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Composition Recommendation Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Quick Compositions:</span>
                      {getDistinctCompositions().slice(0, 8).map((comp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            fetchMedicineAnalytics(comp);
                            setMedSearchInput(comp);
                            setMedSearchSuggestions([]);
                          }}
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '20px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: 'var(--neutral-dark)',
                            cursor: 'pointer'
                          }}
                        >
                          🔬 {comp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Deep Dive Results */}
                  {medicineAnalytics ? (
                    <>
                      {/* Composition Profile Header Banner */}
                      <div className="analytics-panel" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', borderColor: '#99f6e4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.5rem' }}>🔬</span>
                              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f766e' }}>
                                {medicineAnalytics.canonicalComposition || medicineAnalytics.canonicalName}
                              </h3>
                            </div>
                            {medicineAnalytics.brands && medicineAnalytics.brands.length > 0 && (
                              <div style={{ fontSize: '0.85rem', color: '#115e59', fontWeight: 600, marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span>Associated Prescribed Brands:</span>
                                {medicineAnalytics.brands.map((b, idx) => (
                                  <span key={idx} style={{ backgroundColor: '#ffffff', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '0.78rem', fontWeight: 700 }}>
                                    {b.name} ({b.count})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f766e' }}>
                                {medicineAnalytics.totalPatients} <span style={{ fontSize: '0.95rem' }}>Patients</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#134e4a' }}>👥 Total Patients Prescribed</span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#2563eb' }}>
                                {medicineAnalytics.totalPrescriptions} <span style={{ fontSize: '0.95rem' }}>Prescriptions</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>📄 Prescriptions Written</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Histograms: Dosage & Age Distribution */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Dosage Distribution Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📊 Dosage Distribution Histogram</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dosage strength usage</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.dosageHistogram || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center' }}>No dosage data available.</p>
                            ) : (
                              medicineAnalytics.dosageHistogram.map((d, idx) => (
                                <div key={idx} className="histogram-row">
                                  <div className="histogram-row-header">
                                    <span style={{ fontWeight: 700 }}>{d.dosage}</span>
                                    <span style={{ color: '#0f766e', fontWeight: 700 }}>{d.count} patients ({d.percentage}%)</span>
                                  </div>
                                  <div className="histogram-bar-track">
                                    <div className="histogram-bar-fill" style={{ width: `${Math.max(5, d.percentage)}%` }}></div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Patient Age Demographics Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📈 Patient Age Demographics for this Composition</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Age distribution</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.ageHistogram || []).map((a, idx) => (
                              <div key={idx} className="histogram-row">
                                <div className="histogram-row-header">
                                  <span>Age {a.range} years</span>
                                  <span>{a.count} patients ({a.percentage}%)</span>
                                </div>
                                <div className="histogram-bar-track">
                                  <div className="histogram-bar-fill purple" style={{ width: `${Math.max(4, a.percentage)}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      {/* Clinical Diagnostics & Co-Prescription Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Diagnoses Correlation for this composition */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🩺 Diagnostic Indication Correlation</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Conditions prescribed for</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.topDiagnoses || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center' }}>No diagnosis correlation data.</p>
                            ) : (
                              medicineAnalytics.topDiagnoses.map((diag, idx) => (
                                <div key={idx} className="histogram-row">
                                  <div className="histogram-row-header">
                                    <span>{diag.diagnosis}</span>
                                    <span style={{ color: '#2563eb', fontWeight: 700 }}>{diag.count} Rx ({diag.percentage}%)</span>
                                  </div>
                                  <div className="histogram-bar-track">
                                    <div className="histogram-bar-fill blue" style={{ width: `${Math.max(5, diag.percentage)}%` }}></div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Co-Prescription Matrix */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🔗 Common Co-Prescribed Companion Drugs</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Frequently prescribed together</span>
                          </div>

                          <div className="coprescription-grid">
                            {(medicineAnalytics.coPrescriptions || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', width: '100%' }}>No companion drugs co-prescribed.</p>
                            ) : (
                              medicineAnalytics.coPrescriptions.map((co, idx) => (
                                <div key={idx} className="coprescription-tag">
                                  <span>💊 {co.name}</span>
                                  <span className="rate-pill">{co.coOccurrenceRate}%</span>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Dosing Frequency Breakdown */}
                          {medicineAnalytics.topFrequencies?.length > 0 && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Common Dosing Schedules:</span>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                {medicineAnalytics.topFrequencies.map((f, idx) => (
                                  <span key={idx} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                                    ⏰ {f.frequency} ({f.count} Rx)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Recent Patients Prescribed Table */}
                      {medicineAnalytics.recentPrescriptions?.length > 0 && (
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📋 Recent Patients Prescribed {medicineAnalytics.canonicalComposition || medicineAnalytics.canonicalName}</h4>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Date</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Patient Name</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Age/Sex</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Prescribed Brand</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Dosage</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Frequency</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Diagnosis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medicineAnalytics.recentPrescriptions.map((rx, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{rx.date}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>{rx.patientName}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>{rx.patientAge}y / {rx.patientGender}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: 'var(--primary)' }}>{rx.medicineName || rx.name}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{rx.dosage}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>{rx.frequency}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', color: '#334155' }}>{rx.diagnosis}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </>
                  ) : (
                    /* Initial Empty Search State */
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔬</div>
                      <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--neutral-dark)' }}>Search any active composition above</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--neutral-body)' }}>
                        Type an active composition name (e.g. Sertraline, Clonazepam, Escitalopram) to see patient counts, prescribed brands, dosage histograms, and clinical indications.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                /* =================== TAB 3: PRACTICE & PATIENT VOLUME =================== */
                <>
                  {patientVolumeData && (
                    <>
                      {/* Practice Health KPIs */}
                      <div className="analytics-kpi-grid">
                        <div className="analytics-kpi-card teal">
                          <span className="kpi-label">Avg Daily Footfall</span>
                          <span className="kpi-val">{patientVolumeData.avgPatientsPerDay}</span>
                          <span className="kpi-sub">Patients / Working Day</span>
                        </div>

                        <div className="analytics-kpi-card blue">
                          <span className="kpi-label">New Patients (First Visit)</span>
                          <span className="kpi-val">{patientVolumeData.totalNewPatients}</span>
                          <span className="kpi-sub">
                            {patientVolumeData.totalConsultations > 0 ? Math.round((patientVolumeData.totalNewPatients / patientVolumeData.totalConsultations) * 100) : 0}% of Total Footfall
                          </span>
                        </div>

                        <div className="analytics-kpi-card purple">
                          <span className="kpi-label">Follow-Up Consultations</span>
                          <span className="kpi-val">{patientVolumeData.totalFollowUps}</span>
                          <span className="kpi-sub">
                            {patientVolumeData.totalConsultations > 0 ? Math.round((patientVolumeData.totalFollowUps / patientVolumeData.totalConsultations) * 100) : 0}% of Total Footfall
                          </span>
                        </div>

                        <div className="analytics-kpi-card amber">
                          <span className="kpi-label">Follow-Up Retention Rate</span>
                          <span className="kpi-val">{patientVolumeData.retentionRate}%</span>
                          <span className="kpi-sub">Patients Returning for Follow-ups</span>
                        </div>
                      </div>

                      {/* Month Filter Selector Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>🗓️ Filter Daily Logs by Month:</span>
                          <select
                            value={volumeMonthFilter}
                            onChange={(e) => {
                              const mVal = e.target.value;
                              setVolumeMonthFilter(mVal);
                              fetchPatientVolumeAnalytics(mVal);
                            }}
                            style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }}
                          >
                            <option value="">All Recorded Months</option>
                            {(patientVolumeData.monthlyVolume || []).map((m, idx) => (
                              <option key={idx} value={m.month}>{m.monthLabel}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', fontWeight: 700 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
                            <span style={{ width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '3px', display: 'inline-block' }}></span> New Patients
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1d4ed8' }}>
                            <span style={{ width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '3px', display: 'inline-block' }}></span> Follow-Ups
                          </span>
                        </div>
                      </div>

                      {/* Two Column Grid: Daily Breakdown & Monthly Trends */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Daily Patient Footfall Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📅 Daily Patient Volume & Consultation Split</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {(patientVolumeData.dailyVolume || []).length} Active Consultation Days
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
                            {(patientVolumeData.dailyVolume || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', padding: '1.5rem 0' }}>No consultation records found for this period.</p>
                            ) : (
                              patientVolumeData.dailyVolume.map((d, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--neutral-dark)' }}>{d.dateLabel}</span>
                                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.4rem' }}>({d.dayOfWeek})</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>
                                      {d.total} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Patients</span>
                                    </div>
                                  </div>

                                  {/* Stacked Bar Track */}
                                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${d.newRatio}%`, background: '#22c55e' }} title={`New: ${d.newPatients} (${d.newRatio}%)`}></div>
                                    <div style={{ width: `${d.followUpRatio}%`, background: '#3b82f6' }} title={`Follow-Up: ${d.followUps} (${d.followUpRatio}%)`}></div>
                                  </div>

                                  {/* Sub-label indicators */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>
                                    <span style={{ color: '#16a34a' }}>🟢 {d.newPatients} New ({d.newRatio}%)</span>
                                    <span style={{ color: '#2563eb' }}>🔵 {d.followUps} Follow-ups ({d.followUpRatio}%)</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Monthly Footfall & Practice Growth */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📈 Monthly Footfall & Practice Expansion</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Month-over-Month Footfall</span>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Month</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Total</th>
                                  <th style={{ padding: '0.6rem 0.5rem', color: '#16a34a', textAlign: 'center' }}>New</th>
                                  <th style={{ padding: '0.6rem 0.5rem', color: '#2563eb', textAlign: 'center' }}>Follow-ups</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Follow-Up %</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Growth</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(patientVolumeData.monthlyVolume || []).map((m, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>{m.monthLabel}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 800, textAlign: 'center' }}>{m.total}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#16a34a', textAlign: 'center' }}>{m.newPatients}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#2563eb', textAlign: 'center' }}>{m.followUps}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>{m.followUpRate}%</td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: m.momGrowth >= 0 ? '#16a34a' : '#dc2626' }}>
                                      {idx === 0 ? '—' : `${m.momGrowth > 0 ? '+' : ''}${m.momGrowth}%`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Monthly Stacked Bars Overview */}
                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Monthly Volume Histogram</span>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: '90px', padding: '0.75rem 0.25rem 0 0.25rem' }}>
                              {(patientVolumeData.monthlyVolume || []).map((m, idx) => {
                                const maxVol = Math.max(...patientVolumeData.monthlyVolume.map(x => x.total), 1);
                                const newHeight = Math.round((m.newPatients / maxVol) * 80);
                                const followUpHeight = Math.round((m.followUps / maxVol) * 80);
                                return (
                                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                      <div style={{ width: '100%', height: `${followUpHeight}px`, background: '#3b82f6', borderTopLeftRadius: '3px', borderTopRightRadius: '3px' }} title={`${m.monthLabel} Follow-Ups: ${m.followUps}`}></div>
                                      <div style={{ width: '100%', height: `${newHeight}px`, background: '#22c55e' }} title={`${m.monthLabel} New Patients: ${m.newPatients}`}></div>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b' }}>{m.monthLabel.split(' ')[0]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Day of Week Peak Heatmap */}
                      <div className="analytics-panel">
                        <div className="analytics-panel-header">
                          <h4>🗓️ Day-of-Week Patient Footfall Pattern</h4>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Identify peak clinic consultation days</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
                          {(patientVolumeData.dayOfWeekPattern || []).map((w, idx) => {
                            const isPeak = Math.max(...patientVolumeData.dayOfWeekPattern.map(x => parseFloat(x.avgPatientsPerDay))) === parseFloat(w.avgPatientsPerDay) && parseFloat(w.avgPatientsPerDay) > 0;
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: isPeak ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f8fafc',
                                  border: isPeak ? '2px solid #86efac' : '1px solid #e2e8f0',
                                  borderRadius: '10px',
                                  padding: '0.85rem 0.5rem',
                                  textAlign: 'center',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.25rem',
                                  position: 'relative'
                                }}
                              >
                                {isPeak && (
                                  <span style={{ position: 'absolute', top: '-8px', right: '8px', background: '#16a34a', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                                    ⭐ PEAK
                                  </span>
                                )}
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isPeak ? '#166534' : 'var(--neutral-dark)' }}>
                                  {w.day}
                                </span>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: isPeak ? '#15803d' : 'var(--primary)' }}>
                                  {w.avgPatientsPerDay}
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Avg Patients/Day</span>
                                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.25rem', marginTop: '0.25rem', fontSize: '0.65rem', color: '#475569' }}>
                                  {w.totalVisits} Total ({w.newPatients} New • {w.followUps} Ret)
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          SYMPTOM MASTER MANAGEMENT MODAL (FULL CRUD CONTROL FOR DOCTOR)
          ========================================================================= */}
      {showSymptomManagerModal && (
        <div className="analytics-modal-overlay" style={{ zIndex: 1050 }}>
          <div className="analytics-modal-window" style={{ maxWidth: '850px', maxHeight: '90vh' }}>
            
            {/* Modal Header */}
            <div className="analytics-modal-header" style={{ borderBottom: '1.5px solid #0f766e' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: '#0f766e' }}>
                  <span>⚙️</span> Clinical Symptom Master Manager
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Complete doctor control: add, edit wording, or delete any condition category (row) and sub-symptom (sub-row).
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={resetSymptomTemplates}
                  style={{
                    padding: '0.35rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: '#fff1f2',
                    color: '#e11d48',
                    border: '1px solid #fecdd3',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                  title="Reset everything back to default clinical master"
                >
                  🔄 Reset Defaults
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowSymptomManagerModal(false)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    backgroundColor: '#0f766e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Done & Close
                </button>
              </div>
            </div>

            {/* Modal Body: 2 Column Workspace (Left: Categories / Right: Sub-symptoms) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.25rem', padding: '1.25rem', overflowY: 'auto' }}>
              
              {/* Left Column: Category Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>
                    Condition Categories ({symptomTemplates.length})
                  </h4>
                </div>

                {/* Add Category Form */}
                <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: '#f0fdfa', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                  <input
                    type="text"
                    placeholder="Icon"
                    value={managerNewCategoryIcon}
                    onChange={e => setManagerNewCategoryIcon(e.target.value)}
                    style={{ width: '42px', textAlign: 'center', padding: '0.3rem', fontSize: '0.85rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Category Name (e.g. ADHD)"
                    value={managerNewCategoryName}
                    onChange={e => setManagerNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCategoryRow(managerNewCategoryName, managerNewCategoryIcon);
                      }
                    }}
                    style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => addCategoryRow(managerNewCategoryName, managerNewCategoryIcon)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: '#0f766e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ➕ Add
                  </button>
                </div>

                {/* Category List with Edit/Delete on each row */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '420px', overflowY: 'auto' }}>
                  {symptomTemplates.map(cat => {
                    const isSelected = (managerSelectedCatId || symptomTemplates[0]?.id) === cat.id;
                    const isEditing = editingCategoryId === cat.id;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          if (!isEditing) setManagerSelectedCatId(cat.id);
                        }}
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#f0fdfa' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.3rem', width: '100%', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={editingCategoryIcon}
                              onChange={e => setEditingCategoryIcon(e.target.value)}
                              style={{ width: '38px', textAlign: 'center', padding: '0.25rem', fontSize: '0.8rem' }}
                            />
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              style={{ flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                editCategoryRow(cat.id, editingCategoryName, editingCategoryIcon);
                              }}
                              style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(null);
                              }}
                              style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>{cat.icon || '📋'}</span>
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? '#0f766e' : '#1e293b' }}>
                                  {cat.category}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {cat.symptoms.length} sub-symptoms
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCategoryId(cat.id);
                                  setEditingCategoryName(cat.category);
                                  setEditingCategoryIcon(cat.icon || '📋');
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#0f766e', padding: '0.15rem' }}
                                title="Edit Category Name & Icon"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCategoryRow(cat.id);
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#e11d48', padding: '0.15rem' }}
                                title="Delete Category"
                              >
                                🗑️
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Sub-Symptoms for Selected Category */}
              {(() => {
                const currentCat = symptomTemplates.find(c => c.id === (managerSelectedCatId || symptomTemplates[0]?.id));
                if (!currentCat) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                      Select a category to view and edit its symptoms.
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>{currentCat.icon}</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f766e' }}>
                            {currentCat.category} Sub-Symptoms
                          </h4>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {currentCat.symptoms.length} symptoms configured
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Add New Sub-Symptom Form */}
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <input
                        type="text"
                        placeholder={`Type new symptom to add into ${currentCat.category}...`}
                        value={managerNewSymptomText}
                        onChange={e => setManagerNewSymptomText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSymptomSubRow(currentCat.id, managerNewSymptomText);
                          }
                        }}
                        style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}
                      />
                      <button
                        type="button"
                        onClick={() => addSymptomSubRow(currentCat.id, managerNewSymptomText)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#0f766e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ➕ Add Symptom
                      </button>
                    </div>

                    {/* Sub-Symptoms List with Inline Edit/Delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '360px', overflowY: 'auto' }}>
                      {currentCat.symptoms.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                          No symptoms configured under {currentCat.category}.<br/>Use the input box above to add symptoms.
                        </div>
                      ) : (
                        currentCat.symptoms.map((sym, idx) => {
                          const isEditing = editingSymptomIdx === idx;

                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#ffffff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '0.35rem', width: '100%', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={editingSymptomText}
                                    onChange={e => setEditingSymptomText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        editSymptomSubRow(currentCat.id, sym, editingSymptomText);
                                      }
                                    }}
                                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => editSymptomSubRow(currentCat.id, sym, editingSymptomText)}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSymptomIdx(null)}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600 }}>
                                    {idx + 1}. {sym}
                                  </span>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingSymptomIdx(idx);
                                        setEditingSymptomText(sym);
                                      }}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#0f766e', padding: '0.15rem' }}
                                      title="Edit Symptom Wording"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm(`Delete symptom "${sym}"?`)) {
                                          deleteSymptomSubRow(currentCat.id, sym);
                                        }
                                      }}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#e11d48', padding: '0.15rem' }}
                                      title="Delete Symptom"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

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
