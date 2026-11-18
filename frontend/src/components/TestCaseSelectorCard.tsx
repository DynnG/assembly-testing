import React, { useState } from 'react';
import { Layers, Settings, BookOpen } from 'lucide-react';
import { STANDARD_TEST_SCENARIOS } from '../data/testScenarios';
import type {
  TestCaseScenario,
  TaskType,
  RecordingCondition,
  BackgroundNoiseCategory,
} from '../types';

interface TestCaseSelectorCardProps {
  currentScenario: TestCaseScenario;
  onSelectScenario: (scenario: TestCaseScenario) => void;
  onUpdateScenarioFields: (fields: Partial<TestCaseScenario>) => void;
  isProcessing: boolean;
}

export const TestCaseSelectorCard: React.FC<TestCaseSelectorCardProps> = ({
  currentScenario,
  onSelectScenario,
  onUpdateScenarioFields,
  isProcessing,
}) => {
  const [showConfigDetails, setShowConfigDetails] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Test Case Manager & Scenarios</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono border border-slate-700">
                10 Thesis Scenarios
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Select an authorized evaluation scenario or configure custom recording parameters
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowConfigDetails((prev) => !prev)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{showConfigDetails ? 'Hide Test Metadata' : 'Edit Test Metadata'}</span>
        </button>
      </div>

      {/* Scenario Selection Dropdown */}
      <div>
        <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5 block">
          Select Standard Test Scenario:
        </label>
        <select
          value={currentScenario.id}
          onChange={(e) => {
            const found = STANDARD_TEST_SCENARIOS.find((s) => s.id === e.target.value);
            if (found) {
              onSelectScenario(found);
            }
          }}
          disabled={isProcessing}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 font-medium"
        >
          {STANDARD_TEST_SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}: {s.title} ({s.category})
            </option>
          ))}
        </select>
      </div>

      {/* Quick Scenario Summary Card */}
      <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-teal-400 px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20">
              {currentScenario.id}
            </span>
            <span className="font-semibold text-white">{currentScenario.title}</span>
          </div>
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {currentScenario.category}
          </span>
        </div>

        <p className="text-slate-400 text-xs leading-relaxed">
          {currentScenario.description}
        </p>

        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-[11px] text-slate-400">Reference:</span>
          <span className="text-[11px] text-slate-300 font-mono italic truncate">
            "{currentScenario.reference_transcript}"
          </span>
        </div>
      </div>

      {/* Editable Test Configuration Fields (Section 4 variables) */}
      {showConfigDetails && (
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3 pt-3">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 pb-2 border-b border-slate-800">
            <Settings className="w-3.5 h-3.5 text-teal-400" />
            <span>Test Case Provenance & Environmental Variables (Section 4)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {/* Test Case ID */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                test_case_id
              </label>
              <input
                type="text"
                value={currentScenario.id}
                onChange={(e) => onUpdateScenarioFields({ id: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:border-teal-500"
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                task_type
              </label>
              <select
                value={currentScenario.task_type}
                onChange={(e) => onUpdateScenarioFields({ task_type: e.target.value as TaskType })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:border-teal-500"
              >
                <option value="Read Aloud">Read Aloud</option>
                <option value="Spontaneous Response">Spontaneous Response</option>
                <option value="Descriptive Speech">Descriptive Speech</option>
                <option value="Interview Question">Interview Question</option>
                <option value="Free Speaking">Free Speaking</option>
              </select>
            </div>

            {/* Recording Condition */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                recording_condition
              </label>
              <select
                value={currentScenario.recording_condition}
                onChange={(e) =>
                  onUpdateScenarioFields({ recording_condition: e.target.value as RecordingCondition })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:border-teal-500"
              >
                <option value="Quiet Room">Quiet Room</option>
                <option value="Low Background Speech">Low Background Speech</option>
                <option value="Noisy Cafe">Noisy Cafe</option>
                <option value="Office Environment">Office Environment</option>
                <option value="Simulated Noise">Simulated Noise</option>
              </select>
            </div>

            {/* Background Noise Category */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                background_noise_category
              </label>
              <select
                value={currentScenario.background_noise_category}
                onChange={(e) =>
                  onUpdateScenarioFields({
                    background_noise_category: e.target.value as BackgroundNoiseCategory,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:border-teal-500"
              >
                <option value="None / Quiet">None / Quiet</option>
                <option value="Low Background Speech">Low Background Speech</option>
                <option value="Ambient Office">Ambient Office</option>
                <option value="Traffic / Street">Traffic / Street</option>
                <option value="Coffee Shop">Coffee Shop</option>
                <option value="White Noise">White Noise</option>
              </select>
            </div>

            {/* Microphone / Device */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                microphone_or_device
              </label>
              <input
                type="text"
                value={currentScenario.microphone_or_device}
                onChange={(e) => onUpdateScenarioFields({ microphone_or_device: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:border-teal-500"
              />
            </div>

            {/* Speaker Code */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                speaker_or_participant_code
              </label>
              <input
                type="text"
                value={currentScenario.speaker_code}
                onChange={(e) => onUpdateScenarioFields({ speaker_code: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:border-teal-500"
              />
            </div>

            {/* Annotator ID */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                annotator_id
              </label>
              <input
                type="text"
                value={currentScenario.annotator_id}
                onChange={(e) => onUpdateScenarioFields({ annotator_id: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:border-teal-500"
              />
            </div>

            {/* Reference Expected Duration (s) */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                reference_duration (s)
              </label>
              <input
                type="number"
                step="0.1"
                value={currentScenario.reference_response_duration_seconds}
                onChange={(e) =>
                  onUpdateScenarioFields({
                    reference_response_duration_seconds: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:border-teal-500"
              />
            </div>

            {/* Reference Expected Speech Rate (WPM) */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">
                reference_wpm
              </label>
              <input
                type="number"
                step="0.1"
                value={currentScenario.reference_speech_rate_wpm || ''}
                onChange={(e) =>
                  onUpdateScenarioFields({
                    reference_speech_rate_wpm: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g. 135.0"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:border-teal-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
