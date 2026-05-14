export const fmt = {
  time: (d) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
  date: (d) => d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '--',
  ago:  (d) => {
    if (!d) return '--';
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60)   return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  },
  id: (id) => id ? id.slice(0, 8) : '--',
};

export const STATUS_COLORS = {
  done:             'text-green-400  bg-green-400/10  border-green-400/20',
  completed:        'text-green-400  bg-green-400/10  border-green-400/20',
  in_progress:      'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  running:          'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  waiting_approval: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
  pending:          'text-slate-400  bg-slate-400/10  border-slate-400/20',
  failed:           'text-red-400    bg-red-400/10    border-red-400/20',
  cancelled:        'text-slate-500  bg-slate-500/10  border-slate-500/20',
  assigned:         'text-purple-300 bg-purple-300/10 border-purple-300/20',
};
