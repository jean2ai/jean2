import { useState, useCallback, useEffect, useRef } from 'react';
import { HelpCircle, Shield, Monitor } from 'lucide-react';
import type { HumanQuestion, FormQuestion, PermissionAsk, ClientCapabilityAsk, AskFormResponse, AskPermissionResponse, AskResponse } from '@jean2/sdk';
import type { SingleSelectQuestion, MultiSelectQuestion, TextQuestion, ConfirmQuestion } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { PendingAskRequest } from '@/stores/askStore';

interface AskQuestionProps {
  request: PendingAskRequest;
  onRespond: (toolCallId: string, response: AskResponse) => void;
}



// --- SingleSelectView ---
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
            onClick={() => setSelected(option.value)}
            className={`flex flex-col items-start gap-1 p-3 rounded-lg border transition-colors text-left ${
              selected === option.value
                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
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
      {selected !== null && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => onSelect(selected)}>
            Confirm
          </Button>
        </div>
      )}
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

// --- ConfirmView ---
function ConfirmView({
  question,
  onConfirm,
}: {
  question: ConfirmQuestion;
  onConfirm: (value: boolean) => void;
}) {
  const defaultValue = question.defaultValue ?? false;
  const [selected, setSelected] = useState<boolean | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            variant={selected === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelected(false)}
          >
            {defaultValue ? 'No' : 'Cancel'}
          </Button>
          <Button
            variant={selected === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelected(true)}
          >
            {defaultValue ? 'Yes' : 'Confirm'}
          </Button>
        </div>
        {selected !== null && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => onConfirm(selected)}
            >
              Submit
            </Button>
          </div>
        )}
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
  const [answers, setAnswers] = useState<Record<number, string | boolean | string[]>>({});

  const allAnswered = question.questions.every((_, i) => answers[i] !== undefined);

  const handleSubmit = useCallback(() => {
    const response: AskFormResponse = {
      type: 'form',
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
  onAnswer: (answer: string | boolean | string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmValue, setConfirmValue] = useState<boolean | null>(null);
  const onAnswerRef = useRef(onAnswer);
  useEffect(() => {
    onAnswerRef.current = onAnswer;
  });

  useEffect(() => {
    if (selected.size > 0) {
      onAnswerRef.current(Array.from(selected));
    }
  }, [selected]);

  useEffect(() => {
    if (confirmValue !== null) {
      onAnswerRef.current(confirmValue);
    }
  }, [confirmValue]);

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
                onClick={() => {
                  setSelected(new Set([option.value]));
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
                onClick={() => toggle(option.value)}
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
            <Button
              variant={confirmValue === false ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConfirmValue(false)}
            >
              No
            </Button>
            <Button
              variant={confirmValue === true ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConfirmValue(true)}
            >
              Yes
            </Button>
          </div>
        </div>
      );
  }
}

// --- PermissionAskView ---
function PermissionAskView({
  ask,
  onRespond,
}: {
  ask: PermissionAsk;
  onRespond: (response: AskPermissionResponse) => void;
}) {
  const [selected, setSelected] = useState<boolean | null>(null);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const riskColors = {
    low: 'text-success',
    medium: 'text-warning',
    high: 'text-destructive',
  };

  const handleConfirm = () => {
    if (selected !== null) {
      onRespond({ type: 'permission', allowed: selected, alwaysAllow: selected ? alwaysAllow : undefined });
    }
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
      <div className="flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <Button
            variant={selected === false ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setSelected(false)}
          >
            Deny
          </Button>
          <Button
            variant={selected === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelected(true)}
          >
            Approve
          </Button>
        </div>
        {selected === true && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="alwaysAllow"
              checked={alwaysAllow}
              onCheckedChange={(checked) => setAlwaysAllow(checked === true)}
            />
            <label
              htmlFor="alwaysAllow"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Don't ask again for this permission
            </label>
          </div>
        )}
        {selected !== null && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          </div>
        )}
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

  // Handlers for each ask type - properly typed to match AskResponse variants
  const handleSingleSelect = useCallback(
    (value: string) => {
      onRespond(toolCallId, { type: 'single_select', value });
    },
    [toolCallId, onRespond],
  );

  const handleMultiSelect = useCallback(
    (values: string[]) => {
      onRespond(toolCallId, { type: 'multi_select', values });
    },
    [toolCallId, onRespond],
  );

  const handleText = useCallback(
    (value: string) => {
      onRespond(toolCallId, { type: 'text', value });
    },
    [toolCallId, onRespond],
  );

  const handleConfirm = useCallback(
    (confirmed: boolean) => {
      onRespond(toolCallId, { type: 'confirm', confirmed });
    },
    [toolCallId, onRespond],
  );

  const handleForm = useCallback(
    (response: AskFormResponse) => {
      onRespond(toolCallId, response);
    },
    [toolCallId, onRespond],
  );

  const handlePermission = useCallback(
    (response: AskPermissionResponse) => {
      onRespond(toolCallId, response);
    },
    [toolCallId, onRespond],
  );

  const handleClientCapability = useCallback(
    (result: unknown) => {
      const capability = ask.type === 'client_capability' ? ask.capability : '';
      onRespond(toolCallId, { type: 'client_capability', capability, result });
    },
    [toolCallId, onRespond, ask],
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
        <SingleSelectView question={ask} onSelect={handleSingleSelect} />
      )}
      {ask.target === 'human' && ask.type === 'multi_select' && (
        <MultiSelectView question={ask} onSelect={handleMultiSelect} />
      )}
      {ask.target === 'human' && ask.type === 'text' && (
        <TextView question={ask} onSubmit={handleText} />
      )}
      {ask.target === 'human' && ask.type === 'confirm' && (
        <ConfirmView question={ask} onConfirm={handleConfirm} />
      )}
      {ask.target === 'human' && ask.type === 'form' && (
        <FormView question={ask} onSubmit={handleForm} />
      )}
      {ask.target === 'permission' && (
        <PermissionAskView ask={ask} onRespond={handlePermission} />
      )}
      {ask.target === 'client' && (
        <ClientCapabilityAskView ask={ask} onRespond={handleClientCapability} />
      )}
    </div>
  );
}
