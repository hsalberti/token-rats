"use client";

import {
  FAVORITE_CATEGORIES,
  FAVORITE_OPTIONS,
  type FavoriteCategory,
  type ProfileFavorite,
} from "@token-rats/contracts";
import { useState } from "react";
import { FavoriteBadge, ProfileFavoriteBadges } from "./ProfileFavoriteBadges";

export function ProfileFavoritesPicker({
  favorites,
  onChange,
  disabled,
}: {
  favorites: ProfileFavorite[];
  onChange: (favorites: ProfileFavorite[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FavoriteCategory | "all">("all");
  const [customCategory, setCustomCategory] = useState<FavoriteCategory>("software");
  const [customName, setCustomName] = useState("");
  const [customLogo, setCustomLogo] = useState("");
  const [customError, setCustomError] = useState("");
  const matches = FAVORITE_OPTIONS.filter(
    (option) =>
      (category === "all" || category === option.category) &&
      `${option.label} ${option.aliases} ${FAVORITE_CATEGORIES[option.category]}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  function toggle(item: ProfileFavorite) {
    onChange(
      favorites.some((current) => current.id === item.id)
        ? favorites.filter((current) => current.id !== item.id)
        : [...favorites, item],
    );
  }
  function addCustom() {
    const name = customName.trim();
    if (!name) {
      setCustomError("Enter a name for your favorite.");
      return;
    }
    const logoUrl = customLogo.trim();
    if (logoUrl) {
      try {
        if (new URL(logoUrl).protocol !== "https:") throw new Error();
      } catch {
        setCustomError("Use an HTTPS image URL.");
        return;
      }
    }
    const id = `custom:${customCategory}`;
    onChange([
      ...favorites.filter((item) => item.id !== id),
      { id, category: customCategory, name, ...(logoUrl ? { logoUrl } : {}) },
    ]);
    setCustomName("");
    setCustomLogo("");
    setCustomError("");
  }
  return (
    <section
      id="profile-favorites"
      className="scroll-mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
    >
      <div>
        <h3 className="font-semibold text-zinc-100">What you love using</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Show your favorite models, providers, agent software, and subscriptions on your profile.
          Choose up to 40 badges, then save changes.
        </p>
      </div>
      <label className="block text-sm text-zinc-300" htmlFor="favorites-search">
        Search favorites
      </label>
      <input
        id="favorites-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
        placeholder="Search Claude, Codex CLI, GLM, Paseo, Pro…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="flex flex-wrap gap-2" aria-label="Favorite categories">
        {(["all", ...Object.keys(FAVORITE_CATEGORIES)] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            disabled={disabled}
            onClick={() => setCategory(key as FavoriteCategory | "all")}
            className={`rounded-full border px-3 py-1 text-xs ${category === key ? "border-rat-500 bg-rat-500/10 text-rat-300" : "border-zinc-700 text-zinc-400"}`}
          >
            {key === "all" ? "All" : FAVORITE_CATEGORIES[key as FavoriteCategory]}
          </button>
        ))}
      </div>
      <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-zinc-800 p-3">
        {(Object.keys(FAVORITE_CATEGORIES) as FavoriteCategory[]).map((group) => {
          const options = matches.filter((option) => option.category === group);
          return (
            options.length > 0 && (
              <div key={group} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {FAVORITE_CATEGORIES[group]}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((option) => {
                    const checked = favorites.some((item) => item.id === option.id);
                    return (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-950/60 p-2"
                      >
                        <input
                          id={`favorite-${option.id}`}
                          aria-label={option.label}
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || (!checked && favorites.length >= 40)}
                          onChange={() => toggle({ id: option.id, category: option.category })}
                          className="accent-orange-500"
                        />
                        <FavoriteBadge favorite={{ id: option.id, category: option.category }} />
                      </label>
                    );
                  })}
                </div>
              </div>
            )
          );
        })}
        {matches.length === 0 && (
          <p className="text-sm text-zinc-400">No matches. Add a custom favorite below.</p>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {favorites.length}/40 selected · Subscriptions are self reported.
      </p>
      {favorites.length > 0 && (
        <div className="space-y-3">
          <ProfileFavoriteBadges favorites={favorites} />
          <div className="flex flex-wrap gap-2">
            {favorites.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(item)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Remove{" "}
                {item.name ?? FAVORITE_OPTIONS.find((option) => option.id === item.id)?.label} ×
              </button>
            ))}
          </div>
        </div>
      )}
      <details className="rounded-lg border border-zinc-800 p-3">
        <summary className="cursor-pointer text-sm text-zinc-300">Add a custom favorite</summary>
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-zinc-400">
            Category
            <select
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value as FavoriteCategory)}
              disabled={disabled}
              className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
            >
              {(Object.keys(FAVORITE_CATEGORIES) as FavoriteCategory[]).map((key) => (
                <option key={key} value={key}>
                  {FAVORITE_CATEGORIES[key]}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="Custom favorite name"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            maxLength={60}
            disabled={disabled}
            placeholder="Model version, app, provider, or plan name"
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
          />
          <input
            aria-label="Custom favorite logo URL"
            type="url"
            value={customLogo}
            onChange={(event) => setCustomLogo(event.target.value)}
            maxLength={500}
            disabled={disabled}
            placeholder="Logo image URL (optional, https://…)"
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
          />
          <p className="text-xs text-zinc-500">
            One custom badge per category. Adding another replaces it.
          </p>
          {customError && (
            <p role="alert" className="text-sm text-red-400">
              {customError}
            </p>
          )}
          <button
            type="button"
            disabled={
              disabled ||
              (favorites.length >= 40 &&
                !favorites.some((item) => item.id === `custom:${customCategory}`))
            }
            onClick={addCustom}
            className="rounded bg-zinc-800 px-3 py-2 text-sm"
          >
            Add favorite
          </button>
        </div>
      </details>
    </section>
  );
}
