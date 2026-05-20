import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, Check, Wand2 } from 'lucide-react';

export default function ShareProcessingPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success'>('processing');

  const handleClose = () => {
    // 1. Try standard close
    window.close();

    // 2. Try the chrome-specific "close if window was a share target" behavior
    if (typeof window.opener !== 'undefined') {
      window.open('', '_self', '');
      window.close();
    }

    // 3. Try to go back
    window.history.back();

    // 4. Fallback: Internal navigate first (smoother)
    navigate('/', { replace: true });

    // 5. Hard Fallback: Full page reload if still stuck after a moment
    setTimeout(() => {
      if (window.location.pathname === '/share-processing') {
        window.location.replace('/');
      }
    }, 500);
  };

  useEffect(() => {
    // Stage 1: Transition to success
    const successTimer = setTimeout(() => {
      setStatus('success');
    }, 2500); // Much faster transition

    // Stage 2: Auto-close window as a fallback
    const closeTimer = setTimeout(() => {
      handleClose();
    }, 8000);

    return () => {
      clearTimeout(successTimer);
      clearTimeout(closeTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050505] overflow-hidden text-white select-none">
      {/* Optimized Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,5,0.8)_100%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12 px-8 max-w-sm text-center">
        {/* Central Icon with pulsing rings */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {status === 'processing' ? (
              <motion.div
                key="processing"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0, rotate: -10 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="relative z-10 w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(168,85,247,0.4)] flex items-center justify-center overflow-hidden"
              >
                <img src="/logo-192.png" alt="Spendly" className="w-16 h-16 object-contain pointer-events-none" />
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                />
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ scale: 0.5, opacity: 0, rotate: 10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="relative z-10 w-24 h-24 rounded-[32px] bg-success/20 border border-success/40 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(34,197,94,0.4)] flex items-center justify-center"
              >
                <Check className="w-12 h-12 text-success" strokeWidth={3} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {status === 'processing' && (
              <motion.div
                key="ring"
                animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 border border-primary/20 rounded-[32px] z-0 will-change-transform"
              />
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="space-y-3"
          >
            <h1 className="text-2xl font-bold tracking-tight text-white/90 transition-all duration-500">
              {status === 'processing' ? 'Working our magic!' : 'Analyzed & Ready!'}
            </h1>
            <p className="text-sm text-white/50 leading-relaxed max-w-[240px] mx-auto">
              {status === 'processing'
                ? "We're organizing your expense and getting everything ready for you."
                : "Check your notifications to review and save this expense to Spendly."}
            </p>
          </motion.div>

          {/* Progress Items */}
          <div className="flex flex-col gap-4 mt-8">
            <StageItem delay={0.4} label="Securely connected" done />
            <StageItem delay={1.0} label="AI analysis in progress" done={status === 'success'} />
            <StageItem delay={1.8} label="Preparing your summary" done={status === 'success'} />
          </div>
        </div>

        <AnimatePresence>
          {status === 'success' ? (
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
              onClick={handleClose}
              className="mt-6 px-10 py-3 rounded-2xl bg-white text-black font-bold text-sm shadow-[0_10px_30px_-10px_rgba(255,255,255,0.3)] active:scale-95 transition-transform"
            >
              Done
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.5, duration: 0.8 }}
              className="flex items-center gap-2 text-xs font-medium text-primary/80 mt-6 bg-primary/10 px-4 py-2 rounded-full border border-primary/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="tracking-wide uppercase text-[10px]">Financial clarity awaits</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle particle decoration - reduced for performance */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -60],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              delay: i * 0.5
            }}
            className="absolute w-1 h-1 bg-primary rounded-full will-change-transform"
            style={{
              left: `${15 + i * 15}%`,
              top: `${85}%`
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StageItem({ label, done, delay }: { label: string; done?: boolean; delay: number }) {
  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay, duration: 0.6 }}
      className="flex items-center gap-4 text-left"
    >
      <div className="flex-shrink-0">
        {done ? (
          <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center border border-success/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          </div>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full"
            />
          </div>
        )}
      </div>
      <span className={done ? "text-sm text-white/30" : "text-sm font-medium text-white/70"}>
        {label}
      </span>
    </motion.div>
  );
}
