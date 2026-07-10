import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cover } from '../components/ui/cover';

import { authFetch, removeToken } from '../utils/authFetch';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const roleLabels = { swe: 'SWE', pm: 'PM', design: 'Design', marketing: 'Marketing' };
const levelLabels = { intern: 'Intern', junior: 'Junior', mid: 'Mid', senior: 'Senior' };
const typeLabels = { behavioral: 'Behavioral', technical: 'Technical', 'case-study': 'Case Study' };

function SparkLine({ data }) {
  if (!data || data.length < 2) return <div className="text-zinc-600 text-xs text-center py-4">Complete more sessions to see your trend</div>;
  const width = 300;
  const height = 40;
  const max = 10;
  const min = 0;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    // adding padding so stroke doesn't get clipped
    const y = (height - 4) - ((val - min) / (max - min)) * (height - 8) + 4;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] tracking-widest uppercase font-bold text-zinc-500">Performance Trend</span>
        <span className="text-[10px] tracking-widest uppercase font-bold text-[#e04f32]">Last {data.length} Sessions</span>
      </div>
      <div className="w-full relative bg-black/20 rounded-xl p-4 border border-white/5">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[60px] overflow-visible">
          <polyline
            fill="none"
            stroke="#e04f32"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            className="drop-shadow-[0_0_8px_rgba(224,79,50,0.5)]"
          />
          {data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = (height - 4) - ((val - min) / (max - min)) * (height - 8) + 4;
            return (
              <circle key={i} cx={x} cy={y} r="4" fill="#111" stroke="#e04f32" strokeWidth="2" />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(3);
  const [isExploring, setIsExploring] = useState(false);
  const [stats, setStats] = useState({ averageScore: 0, trend: [] });
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [personalityOpen, setPersonalityOpen] = useState(false);
  const [selectedPersonality, setSelectedPersonality] = useState('standard');
  const [formData, setFormData] = useState({ email: '', password: '', targetRoles: [] });
  const [isThemeLight, setIsThemeLight] = useState(false);
  const dropdownRef = useRef(null);

  // Initialize theme from local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') toggleTheme(true);
  }, []);

  const toggleTheme = (forceLight) => {
    const newTheme = typeof forceLight === 'boolean' ? forceLight : !isThemeLight;
    setIsThemeLight(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('theme-light');
      localStorage.setItem('theme', 'dark');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authFetch(`${API}/auth/logout`, { method: 'POST' });
      removeToken();
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API}/auth/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSettingsModalOpen(false);
        alert('Profile updated successfully');
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleRoleToggle = (role) => {
    setFormData(prev => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role) 
        ? prev.targetRoles.filter(r => r !== role) 
        : [...prev.targetRoles, role]
    }));
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session? This will also delete the associated feedback.')) return;
    
    try {
      const res = await authFetch(`${API}/sessions/${sessionId}`, { 
        method: 'DELETE'
      });
      if (res.ok) {
        setSessions(sessions.filter(s => s._id !== sessionId));
        // Also refresh stats to be safe
        const statsRes = await authFetch(`${API}/feedback/stats`);
        const statsData = await statsRes.json();
        if (statsRes.ok) setStats(statsData);
      } else {
        alert('Failed to delete session');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await authFetch(`${API}/auth/me`);
        if (!userRes.ok) {
          navigate('/login');
          return;
        }
        const data = await userRes.json();
        if (userRes.ok) {
          setUserName(data.user.name || 'Professional');
          setFormData({ ...formData, email: data.user.email, targetRoles: data.user.targetRoles || [] });
        }

        const sessRes = await authFetch(`${API}/sessions`);
        const sessData = await sessRes.json();
        if (sessRes.ok) {
          setSessions(sessData.sessions || []);
        }

        const statsRes = await authFetch(`${API}/feedback/stats`);
        const statsData = await statsRes.json();
        if (statsRes.ok) {
          setStats(statsData);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <p className="text-on-surface-variant animate-pulse font-bold tracking-widest uppercase text-xs">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-orion-body text-on-surface antialiased bg-surface">
      {/* Top Header Navigation */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-transparent backdrop-blur-xl h-24 flex justify-between items-center px-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center shadow-lg shadow-primary-container/20">
            <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
          </div>
          <span className="text-2xl font-black tracking-tighter text-[#e04f32] uppercase font-orion-headline">ORION</span>
        </div>
        
        <div className="flex items-center gap-8">
          <Link to="/onboarding" className="hidden md:flex bg-[#e04f32] text-white px-8 py-3.5 rounded-full font-semibold text-xs tracking-widest uppercase transition-transform duration-300 hover:scale-105">
            New Session
          </Link>
          <div className="flex items-center gap-6 border-l border-white/10 pl-8">
            <button onClick={() => toggleTheme()} className="material-symbols-outlined text-zinc-400 hover:text-primary-container transition-colors">
              {isThemeLight ? 'light_mode' : 'dark_mode'}
            </button>

            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-10 h-10 rounded-xl bg-primary-container/20 overflow-hidden border border-primary-container/30 shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
              >
                <span className="material-symbols-outlined text-primary-container">person</span>
              </button>
              
              {dropdownOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-50">
                  <div className="px-4 py-2 border-b border-white/5 mb-1">
                    <p className="text-white text-sm font-bold truncate">{userName}</p>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-0.5">User Profile</p>
                  </div>
                  
                  <Link to="/resume" className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3">
                    <span className="material-symbols-outlined text-[18px]">description</span>
                    My Resume
                  </Link>
                  
                  <button onClick={() => { setSettingsModalOpen(true); setDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3 mb-1 border-b border-white/5 pb-3">
                    <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                    Account Settings
                  </button>

                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#e04f32] font-semibold hover:bg-[#e04f32]/10 transition-colors flex items-center gap-3"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>



      {/* Main Content Canvas */}
      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, staggerChildren: 0.1 }}
        className="pt-40 pb-16 px-6 md:px-10 max-w-[1200px] mx-auto"
      >
        {/* Welcome Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-14 text-center md:text-left"
        >
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            Welcome back, <Cover className="text-[#e04f32]">{userName}</Cover>
          </h2>
          <p className="text-zinc-500 text-xs font-medium tracking-[0.3em] uppercase opacity-80">Your AI coaching terminal is synchronized and ready.</p>
        </motion.section>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-12 gap-10"
        >
          {/* Left Column */}
          <div className="col-span-12 xl:col-span-5 space-y-10">
            {/* Readiness Score Card */}
            <div className="glass-panel rounded-[2.5rem] p-10 relative overflow-hidden group card-pop">
              <div className="absolute -top-10 -right-10 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500">
                <span className="material-symbols-outlined text-[12rem] text-primary-container">monitoring</span>
              </div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <span className="text-primary-container text-xs font-semibold tracking-[0.25em] uppercase block mb-3 opacity-80">Readiness Score</span>
                    <div className="flex items-baseline gap-1">
                      <h3 className="text-7xl font-black text-white font-orion-headline">
                        {sessions.length === 0 ? '--' : Math.round(stats.averageScore || 0)}
                      </h3>
                      <span className="text-zinc-600 text-3xl font-bold">/10</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <span className="bg-primary-container/10 border border-primary-container/20 text-primary-container px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase">
                      {sessions.length === 0 ? 'Pending Assessment' : 'Initial Assessment'}
                    </span>
                  </div>
                </div>

                <p className="text-zinc-400 text-sm leading-relaxed mb-6 font-medium">
                  {sessions.length === 0 
                    ? "Start your first professional assessment session to establish your baseline score and uncover specific areas for growth."
                    : "Your conceptual understanding is strong, but focus on accelerating your response delivery and technical articulation in Case Study scenarios."}
                </p>

                {/* Conceptual Design: Segmented Bars Visual */}
                <div className="flex gap-2.5 w-full mb-10 px-2">
                  {[...Array(10)].map((_, i) => {
                    const activeScore = sessions.length === 0 ? 0 : Math.round(stats.averageScore || 0);
                    return (
                      <div
                        key={i}
                        className={`h-4 flex-1 rounded-full transition-all duration-500 ${
                          i < activeScore
                            ? 'bg-[#e04f32]'
                            : 'bg-transparent border border-white/20'
                        }`}
                      />
                    );
                  })}
                </div>

                <SparkLine data={stats.trend} />

                <div className="mt-10 relative">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] tracking-widest uppercase font-bold text-zinc-500">Interviewer Personality</span>
                    <button 
                      onClick={() => setPersonalityOpen(!personalityOpen)}
                      className="text-[#e04f32] text-xs font-bold uppercase tracking-widest flex items-center gap-1 hover:brightness-125 transition-all"
                    >
                      {selectedPersonality === 'standard' ? 'Standard HR' : selectedPersonality === 'mentor' ? 'Supportive Mentor' : 'FAANG Griller'}
                      <span className="material-symbols-outlined text-sm">{personalityOpen ? 'expand_less' : 'expand_more'}</span>
                    </button>
                  </div>
                  
                  {personalityOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-full left-0 right-0 mb-4 bg-[#1a1a1a] border border-white/10 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1"
                    >
                      {[{ id: 'standard', title: 'Standard HR', desc: 'Professional, neutral, balanced.' },
                        { id: 'mentor', title: 'Supportive Mentor', desc: 'Encouraging tone, easier follow-ups.' },
                        { id: 'faang', title: 'FAANG Griller', desc: 'High stress, skeptical, deep technical probes.' }
                      ].map(p => (
                        <button 
                          key={p.id}
                          onClick={() => { setSelectedPersonality(p.id); setPersonalityOpen(false); }}
                          className={`flex flex-col items-start p-3 rounded-xl transition-colors ${selectedPersonality === p.id ? 'bg-[#e04f32]/20 border border-[#e04f32]/50' : 'hover:bg-white/5 border border-transparent'}`}
                        >
                          <span className={`text-sm font-bold ${selectedPersonality === p.id ? 'text-[#e04f32]' : 'text-white'}`}>{p.title}</span>
                          <span className="text-[10px] text-zinc-500 tracking-wide mt-1">{p.desc}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 gap-5 mt-4">
                    <Link to="/onboarding" state={{ personality: selectedPersonality }} className="bg-[#e04f32] text-white py-4 px-6 rounded-full font-semibold text-xs tracking-widest uppercase transition-transform duration-300 hover:scale-105 text-center shadow-lg shadow-[#e04f32]/20">
                      Start Interview
                    </Link>
                    <Link to="/resume" className="bg-[#1a1a1a] text-white py-4 px-6 rounded-full font-semibold text-xs tracking-widest uppercase transition-colors duration-300 hover:bg-[#252525] text-center border border-white/5 border-t-white/10">
                      Resume Practice
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interview History */}
          <div className="col-span-12 xl:col-span-7 space-y-8">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold text-white tracking-tight uppercase">Interview History</h3>
              {sessions.length > 3 && (
                <button 
                  onClick={() => {
                    if (isExploring) {
                      setIsExploring(false);
                      setVisibleHistoryCount(3);
                    } else {
                      setIsExploring(true);
                      setVisibleHistoryCount(6);
                    }
                  }}
                  className="text-zinc-500 hover:text-white text-[10px] font-semibold tracking-[0.2em] transition-colors uppercase flex items-center gap-1 focus:outline-none"
                >
                  {isExploring ? 'Collapse History' : 'Explore Full History'}
                  <span className="material-symbols-outlined text-xs">{isExploring ? 'expand_less' : 'expand_more'}</span>
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="glass-panel rounded-[2.5rem] p-16 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary-container/10 flex items-center justify-center mb-6 border border-primary-container/20 shadow-lg shadow-primary-container/10">
                  <span className="material-symbols-outlined text-primary-container text-4xl">history</span>
                </div>
                <h4 className="text-white text-xl font-bold font-orion-headline mb-2">No Sessions Yet</h4>
                <p className="text-zinc-500 text-sm max-w-xs mb-10">Start your first AI-powered interview simulation to begin your journey.</p>
                <Link to="/onboarding" className="px-10 py-4 bg-[#e04f32] text-white rounded-full font-bold text-xs tracking-widest uppercase transition-transform duration-300 hover:scale-105">
                  Initialize Terminal
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <AnimatePresence>
                  {sessions.slice(0, visibleHistoryCount).map((session) => (
                    <motion.div
                      key={session._id}
                      layout
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="glass-panel rounded-[2.5rem] p-8 group card-pop"
                    >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="bg-zinc-800 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest border border-white/5">
                            {levelLabels[session.level] || session.level} Role
                          </span>
                          <span className="bg-primary-container/20 text-primary-container px-3.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest border border-primary-container/10">
                            {roleLabels[session.role] || session.role}
                          </span>
                          <span className="bg-white/5 text-zinc-400 px-3.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest border border-white/5">
                            {typeLabels[session.interviewType] || session.interviewType}
                          </span>
                        </div>
                        <h4 className="text-white text-lg font-semibold tracking-tight">
                          {session.jobDescription?.split('\n')[0] || `${roleLabels[session.role] || 'General'} Professional Assessment`}
                        </h4>
                        <div className="flex items-center gap-8 text-zinc-500 text-xs font-semibold">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="material-symbols-outlined text-base opacity-70">calendar_today</span>
                            <span>{new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()} • {new Date(session.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-base opacity-70">quiz</span>
                            <span>{session.questions?.length || 0} QUESTIONS</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 self-start md:self-center">
                        <Link
                          to={`/feedback/${session._id}`}
                          className="px-8 py-3.5 bg-[#e04f32] text-white text-[10px] font-semibold uppercase tracking-widest rounded-full transition-transform duration-300 hover:scale-105 text-center"
                        >
                          View Feedback
                        </Link>
                        <button
                          onClick={() => handleDeleteSession(session._id)}
                          className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-500 hover:text-[#e04f32] hover:bg-[#e04f32]/10 transition-all active:scale-90"
                          title="Delete Session"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
                
                {isExploring && visibleHistoryCount < sessions.length && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pt-4">
                    <button
                      onClick={() => setVisibleHistoryCount(prev => prev + 3)}
                      className="px-8 py-3 bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full text-xs font-semibold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">history</span> VIEW MORE
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-surface-container-lowest/50 py-12 mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 md:px-12 w-full max-w-[1200px] mx-auto gap-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 font-medium">
            © 2024 ORION INTELLIGENCE. ENGINEERED FOR EXCELLENCE.
          </p>
          <div className="flex gap-10">
            <a className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors font-medium" href="#">Privacy</a>
            <a className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors font-medium" href="#">Terms</a>
            <a className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors font-medium" href="#">Status</a>
            <a className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors font-medium" href="#">Security</a>
          </div>
        </div>
      </footer>

      {/* Settings Modal Overlay */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative"
          >
            <button onClick={() => setSettingsModalOpen(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-2xl font-bold mb-6 text-white font-orion-headline">Account Settings</h2>
            
            <form onSubmit={handleUpdateSettings} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Target Roles</label>
                <div className="flex flex-wrap gap-2">
                  {['swe', 'pm', 'design', 'marketing'].map(role => (
                    <button
                      type="button"
                      key={role}
                      onClick={() => handleRoleToggle(role)}
                      className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors ${
                        formData.targetRoles.includes(role) 
                          ? 'bg-[#e04f32] border-[#e04f32] text-white' 
                          : 'bg-transparent border-white/20 text-zinc-400 hover:border-white/50'
                      }`}
                    >
                      {role === 'swe' ? 'Engineering' : role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Email Address</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#e04f32] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">New Password (Optional)</label>
                <input 
                  type="password" 
                  placeholder="Leave blank to keep current"
                  value={formData.password} 
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#e04f32] transition-colors"
                />
              </div>

              <button type="submit" className="w-full bg-[#e04f32] text-white px-6 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-[#c6442a] transition-colors mt-4">
                Save Changes
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
