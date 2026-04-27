import { useState, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';
import type { UserQuestion, SingleSelectQuestion, MultiSelectQuestion, TextQuestion, ConfirmQuestion } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface PendingAskUserRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  question: UserQuestion;
}

interface AskUserQuestionProps {
  request: PendingAskUserRequest;
  onRespond: (toolCallId: string, response: unknown) => void;
}

function QuestionHeader({ question, toolName }: { question: string; toolName: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        {toolName}
      </span>
      <p className="text-sm font-medium">{question}</p>
    </div>
  );
}

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

export function AskUserQuestion({ request, onRespond }: AskUserQuestionProps) {
  const { toolCallId, toolName, question } = request;

  const handleRespond = useCallback(
    (response: unknown) => {
      onRespond(toolCallId, response);
    },
    [toolCallId, onRespond],
  );

  return (
    <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex items-start gap-2 text-primary">
        <HelpCircle className="size-4 mt-0.5 shrink-0" />
        <QuestionHeader question={question.question} toolName={toolName} />
      </div>

      {question.type === 'single_select' && (
        <SingleSelectView question={question} onSelect={handleRespond} />
      )}
      {question.type === 'multi_select' && (
        <MultiSelectView question={question} onSelect={handleRespond} />
      )}
      {question.type === 'text' && (
        <TextView question={question} onSubmit={handleRespond} />
      )}
      {question.type === 'confirm' && (
        <ConfirmView question={question} onConfirm={handleRespond} />
      )}
    </div>
  );
}