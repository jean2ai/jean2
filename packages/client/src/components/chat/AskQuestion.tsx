import { useState, useCallback } from 'react';
import { HelpCircle, Shield, Monitor } from 'lucide-react';
import type { HumanQuestion, FormQuestion, PermissionAsk, ClientCapabilityAsk, AskFormResponse } from '@jean2/sdk';
import type { SingleSelectQuestion, MultiSelectQuestion, TextQuestion, ConfirmQuestion } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { PendingAskRequest } from '@/stores/askStore';

interface AskQuestionProps {
  request: PendingAskRequest;
  onRespond: (toolCallId: string, response: unknown) => void;
}



// --- SingleSelectView (unchanged) ---
function SingleSelectView({
  question,
  onSelect,
}: {
  question: SingleSelectQuestion;
  onSelect: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setSelected(option.value);
              onSelect(option.value);
            }}
            className="flex flex-col items-start gap-1 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 w-full">
              <div
                className={`size-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selected === option.value
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground'
                }`}
              >
                {selected === option.value && (
                  <div className="size-2 rounded-full bg-primary-foreground" />
                )}
              </div>
              <span className="font-medium">{option.label}</span>
            </div>
            {option.description && (
              <span className="text-xs text-muted-foreground pl-6">{option.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- MultiSelectView (unchanged) ---
function MultiSelectView({
  question,
  onSelect,
}: {
  question: MultiSelectQuestion;
  onSelect: (values: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOption = useCallback((value: string) => {
    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        if (question.max && newSet.size >= question.max) {
          return prev;
        }
        newSet.add(value);
      }
      return newSet;
    });
  }, [question.max]);

  const handleConfirm = useCallback(() => {
    const values = Array.from(selected);
    if (question.min && values.length < question.min) {
      return;
    }
    onSelect(values);
  }, [selected, question.min, onSelect]);

  const isValid = !question.min || selected.size >= question.min;
  const maxReached = question.max ? selected.size >= question.max : false;

  return (
    <div className="flex flex-col gap-3">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const isDisabled = maxReached && !selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleOption(option.value)}
              disabled={isDisabled}
              className={`flex flex-col items-start gap-1 p-3 rounded-lg border transition-colors text-left ${
                isDisabled
                  ? 'border-border opacity-50 cursor-not-allowed'
                  : selected.has(option.value)
                    ? 'border-primary bg-primary/5 hover:bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 w-full">
                <Checkbox
                  checked={selected.has(option.value)}
                  disabled={isDisabled}
                  onCheckedChange={() => toggleOption(option.value)}
                  className="pointer-events-none"
                />
                <span className="font-medium pointer-events-none">{option.label}</span>
              </div>
              {option.description && (
                <span className="text-xs text-muted-foreground pl-6">{option.description}</span>
              )}
            </button>
          );
        })}
      </div>
      {question.min !== undefined && (
        <p className="text-xs text-muted-foreground">
          Select at least {question.min} option{question.min > 1 ? 's' : ''}
          {question.max !== undefined && ` (up to ${question.max})`}
        </p>
      )}
      {question.max !== undefined && !question.min && (
        <p className="text-xs text-muted-foreground">
          Select up to {question.max} option{question.max > 1 ? 's' : ''}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={!isValid}
        >
          Confirm Selection ({selected.size})
        </Button>
      </div>
    </div>
  );
}

// --- TextView (unchanged) ---
function TextView({
  question,
  onSubmit,
}: {
  question: TextQuestion;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState(question.defaultValue || '');

  return (
    <div className="flex flex-col gap-3">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex flex-col gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSubmit(value)}
          >
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => onSubmit(value)}
            disabled={value.trim().length === 0}
          >
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- ConfirmView (unchanged) ---
function ConfirmView({
  question,
  onConfirm,
}: {
  question: ConfirmQuestion;
  onConfirm: (value: boolean) => void;
}) {
  const defaultValue = question.defaultValue ?? false;

  return (
    <div className="flex flex-col gap-3">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onConfirm(false)}
        >
          {defaultValue ? 'No' : 'Cancel'}
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(true)}
        >
          {defaultValue ? 'Yes' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}

// --- FormView (NEW - renders multiple sub-questions as a single form) ---
function FormView({
  question,
  onSubmit,
}: {
  question: FormQuestion;
  onSubmit: (response: AskFormResponse) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, unknown>>({});

  const allAnswered = question.questions.every((_, i) => answers[i] !== undefined);

  const handleSubmit = useCallback(() => {
    const response: AskFormResponse = {
      answers: question.questions.map((q, i) => ({
        question: q.question,
        answer: answers[i],
      })),
    };
    onSubmit(response);
  }, [question.questions, answers, onSubmit]);

  return (
    <div className="flex flex-col gap-4">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex flex-col gap-4">
        {question.questions.map((subQuestion, index) => (
          <div key={index} className="border-l-2 border-primary/30 pl-3">
            <p className="text-xs text-muted-foreground mb-2">Question {index + 1} of {question.questions.length}</p>
            <SubQuestionView
              question={subQuestion}
              onAnswer={(answer) => setAnswers((prev) => ({ ...prev, [index]: answer }))}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          Submit All ({Object.keys(answers).length}/{question.questions.length})
        </Button>
      </div>
    </div>
  );
}

// Helper to render sub-questions inline (without borders)
function SubQuestionView({
  question,
  onAnswer,
}: {
  question: HumanQuestion;
  onAnswer: (answer: unknown) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  switch (question.type) {
    case 'single_select':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{question.question}</p>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onAnswer(option.value)}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      );
    case 'multi_select': {
      const toggle = (value: string) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(value)) next.delete(value);
          else if (!question.max || next.size < question.max) next.add(value);
          return next;
        });
      };
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{question.question}</p>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  toggle(option.value);
                  // Answer immediately with current selection
                  const next = new Set(selected);
                  if (next.has(option.value)) next.delete(option.value);
                  else if (!question.max || next.size < question.max) next.add(option.value);
                  onAnswer(Array.from(next));
                }}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  selected.has(option.value)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'text':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{question.question}</p>
          <Input
            type="text"
            placeholder={question.placeholder}
            defaultValue={question.defaultValue}
            onChange={(e) => onAnswer(e.target.value)}
          />
        </div>
      );
    case 'confirm':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{question.question}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onAnswer(false)}>No</Button>
            <Button size="sm" onClick={() => onAnswer(true)}>Yes</Button>
          </div>
        </div>
      );
  }
}

// --- PermissionAskView (NEW) ---
function PermissionAskView({
  ask,
  onRespond,
}: {
  ask: PermissionAsk;
  onRespond: (value: boolean) => void;
}) {
  const riskColors = {
    low: 'text-success',
    medium: 'text-warning',
    high: 'text-destructive',
  };

  return (
    <div className="flex flex-col gap-3">
      {ask.description && (
        <p className="text-sm text-muted-foreground">{ask.description}</p>
      )}
      {ask.risk && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium uppercase ${riskColors[ask.risk]}`}>
            Risk: {ask.risk}
          </span>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onRespond(false)}>
          Deny
        </Button>
        <Button size="sm" onClick={() => onRespond(true)}>
          Approve
        </Button>
      </div>
    </div>
  );
}

// --- ClientCapabilityAskView (NEW - shows capability request status) ---
function ClientCapabilityAskView({
  ask,
  onRespond,
}: {
  ask: ClientCapabilityAsk;
  onRespond: (response: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Client capability request: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{ask.capability}</code>
      </p>
      {ask.metadata && (
        <pre className="text-xs bg-background border rounded-md p-2 overflow-x-auto">
          {JSON.stringify(ask.metadata, null, 2)}
        </pre>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onRespond(undefined)}>
          Not Available
        </Button>
        <Button size="sm" onClick={() => onRespond(null)}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

// --- Main component ---
export function AskQuestion({ request, onRespond }: AskQuestionProps) {
  const { toolCallId, toolName, ask } = request;

  const handleRespond = useCallback(
    (response: unknown) => {
      onRespond(toolCallId, response);
    },
    [toolCallId, onRespond],
  );

  // Determine icon and border color by target
  const targetConfig = {
    human: { icon: HelpCircle, borderClass: 'border-primary/30 bg-primary/5', iconClass: 'text-primary' },
    permission: { icon: Shield, borderClass: 'border-warning/30 bg-warning/5', iconClass: 'text-warning' },
    client: { icon: Monitor, borderClass: 'border-info/30 bg-info/5', iconClass: 'text-info' },
  };

  const config = targetConfig[ask.target];
  const Icon = config.icon;

  return (
    <div className={`border ${config.borderClass} rounded-lg p-4 flex flex-col gap-4`}>
      <div className={`flex items-start gap-2 ${config.iconClass}`}>
        <Icon className="size-4 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {toolName}
          </span>
          {'question' in ask && <p className="text-sm font-medium">{ask.question}</p>}
        </div>
      </div>

      {ask.target === 'human' && ask.type === 'single_select' && (
        <SingleSelectView question={ask} onSelect={handleRespond} />
      )}
      {ask.target === 'human' && ask.type === 'multi_select' && (
        <MultiSelectView question={ask} onSelect={handleRespond} />
      )}
      {ask.target === 'human' && ask.type === 'text' && (
        <TextView question={ask} onSubmit={handleRespond} />
      )}
      {ask.target === 'human' && ask.type === 'confirm' && (
        <ConfirmView question={ask} onConfirm={handleRespond} />
      )}
      {ask.target === 'human' && ask.type === 'form' && (
        <FormView question={ask} onSubmit={handleRespond} />
      )}
      {ask.target === 'permission' && (
        <PermissionAskView ask={ask} onRespond={handleRespond} />
      )}
      {ask.target === 'client' && (
        <ClientCapabilityAskView ask={ask} onRespond={handleRespond} />
      )}
    </div>
  );
}
