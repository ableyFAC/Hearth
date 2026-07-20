"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Shared client state for the post-a-job form, so three otherwise-separate
// pieces can coordinate without prop-drilling through the server page:
//   - PhotoUpload (via DraftablePhotoUpload) publishes the uploaded photo URLs,
//   - DescriptionField reads the first one to draft a description from it and
//     can preselect the category the draft guessed,
//   - CategoryFilter reads/writes the category and records whether the OWNER
//     picked it, so the draft only preselects when they haven't.
// The provider renders no DOM of its own, so the form's spacing is unchanged.
type DraftJobState = {
  photoUrls: string[];
  setPhotoUrls: (urls: string[]) => void;
  category: string;
  setCategory: (value: string) => void;
  categoryTouched: boolean;
  markCategoryTouched: () => void;
};

const DraftJobContext = createContext<DraftJobState | null>(null);

export function DraftJobProvider({
  initialCategory,
  children,
}: {
  initialCategory: string;
  children: ReactNode;
}) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [category, setCategory] = useState(initialCategory);
  const [categoryTouched, setCategoryTouched] = useState(false);

  return (
    <DraftJobContext.Provider
      value={{
        photoUrls,
        setPhotoUrls,
        category,
        setCategory,
        categoryTouched,
        markCategoryTouched: () => setCategoryTouched(true),
      }}
    >
      {children}
    </DraftJobContext.Provider>
  );
}

// Optional: components that also render outside this form (PhotoUpload,
// CategoryFilter) get null and fall back to their standalone behavior.
export function useDraftJob(): DraftJobState | null {
  return useContext(DraftJobContext);
}
