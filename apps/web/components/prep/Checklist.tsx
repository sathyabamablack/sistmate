"use client";

import * as React from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button, buttonClass } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  MAX_TOPICS,
  MAX_TOPIC_LENGTH,
  addTopic,
  removeTopic,
  renameTopic,
  setTopicDone,
  topicProgress,
  topicsFor,
  withTopics,
  type Topic,
} from "@/lib/prep";
import { savePrep, usePrepState } from "./store";

/**
 * The subject's revision topics: tick them off as you go. Ticking is the everyday action, so
 * the list is plain checkboxes; renaming and removing wait behind "Edit topics".
 */
export function Checklist({ code, title }: { code: string; title: string }) {
  const state = usePrepState();
  const topics = topicsFor(state, code);
  const progress = topicProgress(topics);
  const [editing, setEditing] = React.useState(false);
  const save = (next: Topic[]) => savePrep(withTopics(state, code, next));

  return (
    <Section
      id="revision"
      title="Revision"
      action={
        topics.length > 0 || editing ? (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="focusable inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline-offset-4 hover:underline lg:min-h-0"
          >
            {editing ? "Done" : "Edit topics"}
          </button>
        ) : null
      }
    >
      {topics.length > 0 ? (
        <div className="mb-3 flex items-center gap-3">
          <ProgressBar
            value={progress.percent}
            tone={progress.done === progress.total ? "success" : "primary"}
            className="h-1.5 flex-1"
            aria-label={`${title} revision`}
          />
          <p aria-live="polite" className="shrink-0 text-small tabular-nums text-muted-foreground">
            {progress.done === progress.total ? (
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                All {progress.total} revised
              </span>
            ) : (
              `${progress.done} of ${progress.total} revised`
            )}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-body text-muted-foreground">
          No topics yet. Add the units or chapters you want to revise.
        </p>
      )}

      <ul className="divide-y divide-border">
        {topics.map((t) =>
          editing ? (
            <EditRow
              key={t.id}
              topic={t}
              onRename={(name) => save(renameTopic(topics, t.id, name))}
              onRemove={() => save(removeTopic(topics, t.id))}
            />
          ) : (
            <li key={t.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => save(setTopicDone(topics, t.id, e.target.checked))}
                  className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span
                  className={cn(
                    "min-w-0 break-words text-body",
                    t.done ? "text-muted-foreground line-through decoration-muted-foreground/60" : "text-foreground",
                  )}
                >
                  {t.name}
                </span>
              </label>
            </li>
          ),
        )}
      </ul>

      <AddTopic full={topics.length >= MAX_TOPICS} onAdd={(name) => save(addTopic(topics, name))} />
    </Section>
  );
}

/** Rename in place (saved when the field loses focus or on Enter) or remove. */
function EditRow({
  topic,
  onRename,
  onRemove,
}: {
  topic: Topic;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = React.useState(topic.name);
  const commit = () => {
    if (draft.trim()) onRename(draft);
    else setDraft(topic.name);
  };
  return (
    <li className="flex items-center gap-2 py-1.5">
      <input
        type="text"
        value={draft}
        maxLength={MAX_TOPIC_LENGTH}
        aria-label={`Rename ${topic.name}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(topic.name);
        }}
        className={fieldClass}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${topic.name}`}
        className={buttonClass("ghost", "icon", "shrink-0 hover:text-danger")}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

function AddTopic({ full, onAdd }: { full: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = React.useState("");
  const id = React.useId();
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name);
        setName("");
      }}
    >
      <label htmlFor={id} className="sr-only">
        New topic
      </label>
      <input
        id={id}
        type="text"
        value={name}
        maxLength={MAX_TOPIC_LENGTH}
        disabled={full}
        placeholder={full ? `That's the most a subject can hold (${MAX_TOPICS})` : "Add a topic"}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        className={cn(fieldClass, "disabled:opacity-60")}
      />
      <Button type="submit" variant="outline" disabled={full || !name.trim()} className="shrink-0">
        <Plus className="h-4 w-4" aria-hidden />
        Add
      </Button>
    </form>
  );
}
