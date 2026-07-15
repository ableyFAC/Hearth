"use client";

import { useState } from "react";
import Link from "next/link";
import { JOB_CATEGORIES, labelFor, iconFor } from "@/lib/constants";
import { saveProjectAction, deleteProjectAction } from "./project-actions";
import ProjectPhotoManager from "./ProjectPhotoManager";

// "Projects" tab: the pro's portfolio of completed work, shown on their
// public page (/p/<id>) in a section of its own, separate from reviews.
// Every pro can showcase up to 3 projects; Pro members get unlimited plus
// public Before/After badges. Both limits are enforced server-side in
// project-actions.ts; this UI only mirrors them.

export type ProProjectPhoto = {
  id: string;
  url: string;
  is_before: boolean;
  sort: number;
};

export type ProProject = {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  months: string | null;
  sort: number;
  created_at: string;
  photos: ProProjectPhoto[];
};

const FREE_PROJECT_LIMIT = 3;

export default function ProjectsCard({
  contractorId,
  member,
  projects,
}: {
  contractorId: string;
  member: boolean;
  projects: ProProject[];
}) {
  // null = list view, "new" = create form, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  const atFreeCap = !member && projects.length >= FREE_PROJECT_LIMIT;
  const current =
    editing && editing !== "new"
      ? (projects.find((p) => p.id === editing) ?? null)
      : null;

  if (editing) {
    return (
      <ProjectForm
        contractorId={contractorId}
        project={current}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Your projects</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Photo albums of completed work, shown on your public page.
              Homeowners hire pros they can see examples from.
            </p>
          </div>
          {!atFreeCap && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="btn-primary"
            >
              Add Project
            </button>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
            No projects yet. Add your first one: a few photos and a title are
            all it takes.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-white/10">
            {projects.map((p) => (
              <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 dark:text-stone-100">{p.title}</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {p.category
                        ? `${iconFor(JOB_CATEGORIES, p.category)} ${labelFor(JOB_CATEGORIES, p.category)}`
                        : "No category"}
                      {p.months ? ` · ${p.months}` : ""}
                      {" · "}
                      {p.photos.length} photo{p.photos.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(p.id)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Edit
                    </button>
                    <form
                      action={deleteProjectAction}
                      onSubmit={(e) => {
                        if (
                          !window.confirm(
                            "Delete this project and its photos?"
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="project_id" value={p.id} />
                      <button
                        type="submit"
                        className="btn-secondary text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                {p.photos.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {p.photos.map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={ph.id}
                        src={ph.url}
                        alt={`${p.title} photo`}
                        className="h-16 w-16 flex-none rounded-lg border border-stone-200 object-cover dark:border-white/10"
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {atFreeCap && (
        <section className="card space-y-2">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">
            Want more than {FREE_PROJECT_LIMIT} projects?
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Every pro can showcase up to {FREE_PROJECT_LIMIT} projects for
            free. Hearth Pro members get unlimited projects, plus
            Before/After badges on their public photos.
          </p>
          <Link href="/pro/plus" className="btn-primary inline-block">
            See Hearth Pro
          </Link>
        </section>
      )}

      {!member && !atFreeCap && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Free accounts can showcase up to {FREE_PROJECT_LIMIT} projects.
          Hearth Pro members get unlimited projects and public Before/After
          badges:{" "}
          <Link href="/pro/plus" className="text-hearth-700 hover:underline dark:text-hearth-300">
            see Hearth Pro
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function ProjectForm({
  contractorId,
  project,
  onCancel,
}: {
  contractorId: string;
  project: ProProject | null;
  onCancel: () => void;
}) {
  return (
    <form action={saveProjectAction} className="card space-y-5">
      <div>
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">
          {project ? "Edit project" : "Add a project"}
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          It appears on your public page in its own Projects section, clearly
          separate from your reviews.
        </p>
      </div>

      {project && (
        <input type="hidden" name="project_id" value={project.id} />
      )}

      <div>
        <label className="label">Title</label>
        <input
          name="title"
          required
          maxLength={80}
          defaultValue={project?.title ?? ""}
          placeholder="e.g. Full kitchen remodel in Maple Grove"
          className="input"
        />
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Up to 80 characters.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Category</label>
          <select
            name="category"
            defaultValue={project?.category ?? ""}
            className="input"
          >
            <option value="">No category</option>
            {JOB_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">When</label>
          <input
            name="months"
            maxLength={20}
            defaultValue={project?.months ?? ""}
            placeholder="e.g. March 2026"
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          name="description"
          rows={4}
          maxLength={500}
          defaultValue={project?.description ?? ""}
          placeholder="What the job involved and how it turned out."
          className="input h-auto"
        />
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Up to 500 characters.</p>
      </div>

      <ProjectPhotoManager
        contractorId={contractorId}
        initial={(project?.photos ?? []).map((ph) => ({
          url: ph.url,
          before: ph.is_before,
        }))}
      />

      <div className="flex justify-end gap-2 border-t border-stone-100 pt-4 dark:border-white/10">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {project ? "Save Project" : "Add Project"}
        </button>
      </div>
    </form>
  );
}
