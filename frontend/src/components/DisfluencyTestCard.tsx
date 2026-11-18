import React, { useState } from 'react';
import {
  MessageSquareQuote,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  Info,
} from 'lucide-react';
import type { DisfluencyPrompt } from '../types';

interface DisfluencyTestCardProps {
  selectedPrompt: DisfluencyPrompt | null;
  onSelectPrompt: (prompt: DisfluencyPrompt) => void;
  actualTranscriptText: string;
}

const DEFAULT_PROMPTS: DisfluencyPrompt[] = [
  {
    id: 'p1',
    title: 'Filler Word ("Um")',
    category: 'Filler',
    phrase: 'Um, I think I can do this task.',
    description: 'Tests if AssemblyAI retains the hesitation marker "Um" or silently strips it out.',
    targetElements: ['um', 'think'],
  },
  {
    id: 'p2',
    title: 'Stuttered Repetition ("I-I")',
    category: 'Repetition',
    phrase: 'I-I want to explain my idea.',
    description: 'Tests if repetitive single-word stuttering / false start is transcribed or collapsed into a single "I".',
    targetElements: ['i-i', 'i, i', 'i i'],
  },
  {
    id: 'p3',
    title: 'Word Repetition ("The, the")',
    category: 'Repetition',
    phrase: 'The, the main reason is communication.',
    description: 'Tests if duplicate definite article with pause ("The, the") is preserved verbatim.',
    targetElements: ['the, the', 'the the'],
  },
  {
    id: 'p4',
    title: 'Self-Correction / Abandoned Phrase',
    category: 'Self-Correction',
    phrase: 'I wanted to go—actually, I stayed home.',
    description: 'Tests mid-sentence pivot and self-repair ("actually, I stayed home").',
    targetElements: ['wanted to go', 'actually', 'stayed home'],
  },
  {
    id: 'p5',
    title: 'Grammar Error Preservation',
    category: 'Grammar Error',
    phrase: 'Yesterday I go to school and meet my friend.',
    description: 'Tests if grammatical tense errors ("Yesterday I go") are left uncorrected by language modeling.',
    targetElements: ['yesterday', 'go', 'meet'],
  },
];

export const DisfluencyTestCard: React.FC<DisfluencyTestCardProps> = ({
  selectedPrompt,
  onSelectPrompt,
  actualTranscriptText,
}) => {
  const [prompts, setPrompts] = useState<DisfluencyPrompt[]>(DEFAULT_PROMPTS);
  const [customPhrase, setCustomPhrase] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState<DisfluencyPrompt['category']>('Filler');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedExpected, setCopiedExpected] = useState(false);

  const handleAddCustomPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPhrase.trim()) return;

    const newPrompt: DisfluencyPrompt = {
      id: `custom-${Date.now()}`,
      title: customTitle.trim() || 'Custom Speaking Prompt',
      category: customCategory,
      phrase: customPhrase.trim(),
      description: 'Custom test phrase configured by the tester.',
      targetElements: customPhrase
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/)
        .slice(0, 3),
    };

    setPrompts((prev) => [...prev, newPrompt]);
    onSelectPrompt(newPrompt);
    setCustomPhrase('');
    setCustomTitle('');
    setShowAddModal(false);
  };

  const handleDeletePrompt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    if (selectedPrompt?.id === id) {
      const remaining = prompts.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        onSelectPrompt(remaining[0]);
      }
    }
  };

  const copyPhrase = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExpected(true);
    setTimeout(() => setCopiedExpected(false), 2000);
  };

  // Analyze transcript for disfluencies (read-only inspection, does NOT alter transcript)
  const renderComparisonAnalysis = () => {
    if (!actualTranscriptText) {
      return (
        <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-lg text-center text-xs text-slate-500">
          <Eye className="w-5 h-5 mx-auto mb-1.5 text-slate-600" />
          <span>Record or upload audio above and click Transcribe Audio to inspect how AssemblyAI handles this prompt.</span>
        </div>
      );
    }

    if (!selectedPrompt) {
      return (
        <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-lg text-xs text-slate-400 text-center">
          Select a test prompt from the list to compare with the transcript.
        </div>
      );
    }

    const normActual = actualTranscriptText.toLowerCase();

    // Check specific target elements
    const findings: { label: string; found: boolean; detail: string }[] = [];

    if (selectedPrompt.category === 'Filler') {
      const hasUm = normActual.includes('um') || normActual.includes('uh') || normActual.includes('er');
      findings.push({
        label: 'Filler Word Presence',
        found: hasUm,
        detail: hasUm
          ? 'Verbal filler ("um"/"uh") was captured in the transcript.'
          : 'Filler was not detected or was smoothed out by AssemblyAI.',
      });
    } else if (selectedPrompt.category === 'Repetition') {
      const hasRepetition =
        normActual.includes('i-i') ||
        normActual.includes('i, i') ||
        normActual.includes('i i') ||
        normActual.includes('the the') ||
        normActual.includes('the, the');
      findings.push({
        label: 'Repetition Preservation',
        found: hasRepetition,
        detail: hasRepetition
          ? 'Repeated word / stutter was preserved in transcript.'
          : 'Repeated word appears collapsed into a single word.',
      });
    } else if (selectedPrompt.category === 'Grammar Error') {
      const hasErrorPreserved = normActual.includes('go to school') || normActual.includes('yesterday i go');
      findings.push({
        label: 'Unaltered Grammar',
        found: hasErrorPreserved,
        detail: hasErrorPreserved
          ? 'Grammatical tense error ("go") was faithfully transcribed without autocorrecting to "went".'
          : 'Language model may have normalized or altered the phrase.',
      });
    } else {
      findings.push({
        label: 'Verbatim Match Check',
        found: normActual.includes(selectedPrompt.targetElements[0] || ''),
        detail: 'Inspecting raw transcript against expected spoken utterance.',
      });
    }

    return (
      <div className="space-y-3 mt-3">
        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Expected Target Spoken Phrase</span>
              <button
                onClick={() => copyPhrase(selectedPrompt.phrase)}
                className="text-slate-400 hover:text-slate-200"
                title="Copy prompt"
              >
                {copiedExpected ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-white font-mono text-xs leading-relaxed bg-slate-900/60 p-2 rounded border border-slate-800">
              "{selectedPrompt.phrase}"
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Actual AssemblyAI Raw Transcript
            </div>
            <p className="text-teal-300 font-mono text-xs leading-relaxed bg-slate-900/60 p-2 rounded border border-teal-500/20">
              "{actualTranscriptText}"
            </p>
          </div>
        </div>

        {/* Findings assessment */}
        <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Inspection Observations</span>
          </div>

          {findings.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              {item.found ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-semibold text-slate-200">{item.label}: </span>
                <span className="text-slate-300">{item.detail}</span>
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-slate-700/40 text-[11px] text-slate-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Thesis Evaluation Note:</strong> In Articula, speech coaching algorithms calculate hesitation indices and speech rates based on detected pause markers and fillers. If AssemblyAI removes fillers or merges repetitions, Articula's fluency score may inaccurately score the speaker as more fluent than they were.
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
            <MessageSquareQuote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Articula Disfluency & Fluency Experiment</h2>
            <p className="text-xs text-slate-400">
              Evaluate whether AssemblyAI preserves fillers ("um", "uh"), repetitions ("I-I"), and grammatical slips
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom Prompt</span>
        </button>
      </div>

      {/* Prompts list */}
      <div className="mt-4 space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
          Select a Test Prompt to Speak or Evaluate:
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {prompts.map((p) => {
            const isSelected = selectedPrompt?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onSelectPrompt(p)}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all relative group ${
                  isSelected
                    ? 'bg-teal-950/30 border-teal-500/50 shadow-md shadow-teal-950/20'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      p.category === 'Filler'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : p.category === 'Repetition'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        : p.category === 'Self-Correction'
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {p.category}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-medium text-slate-300">{p.title}</span>
                    {p.id.startsWith('custom-') && (
                      <button
                        onClick={(e) => handleDeletePrompt(p.id, e)}
                        className="text-slate-500 hover:text-rose-400 p-0.5"
                        title="Delete custom prompt"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs font-mono text-slate-200 mt-1 leading-snug">
                  "{p.phrase}"
                </p>

                <p className="text-[11px] text-slate-400 mt-1.5 leading-normal">
                  {p.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison and inspection panel */}
      <div className="mt-5 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Transcript Disfluency Inspection
          </label>
          <span className="text-[11px] text-slate-500">
            Raw output is preserved; no artificial filtering applied
          </span>
        </div>
        {renderComparisonAnalysis()}
      </div>

      {/* Modal for adding custom prompt */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">Add Custom Speaking Prompt</h3>
            <form onSubmit={handleAddCustomPrompt} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Title / Label</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. False Start with Pauses"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Disfluency Category</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="Filler">Filler Words (um, uh, erm)</option>
                  <option value="Repetition">Repetitions (I-I, the the)</option>
                  <option value="False Start">False Start / Abandoned</option>
                  <option value="Self-Correction">Self-Correction</option>
                  <option value="Grammar Error">Grammar Error (Unchanged)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Exact Test Phrase to Speak</label>
                <textarea
                  rows={3}
                  value={customPhrase}
                  onChange={(e) => setCustomPhrase(e.target.value)}
                  placeholder="Type the exact phrase including pauses or fillers..."
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                >
                  Add Prompt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
