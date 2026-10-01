import {
  FAVORITE_CATEGORIES,
  type FavoriteCategory,
  type ProfileFavorite,
  favoriteOption,
} from "@token-rats/contracts";

export function FavoriteBadge({ favorite }: { favorite: ProfileFavorite }) {
  const option = favoriteOption(favorite.id);
  const label = favorite.name ?? option?.label ?? favorite.id;
  const icon = favorite.logoUrl ?? option?.icon;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200">
      {icon ? (
        <img
          src={icon}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 rounded-sm object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-700 text-xs"
        >
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      {label}
    </span>
  );
}

export function ProfileFavoriteBadges({ favorites }: { favorites: ProfileFavorite[] }) {
  return (
    <div className="space-y-4">
      {(Object.keys(FAVORITE_CATEGORIES) as FavoriteCategory[]).map((category) => {
        const items = favorites.filter((item) => item.category === category);
        return (
          items.length > 0 && (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400">
                {FAVORITE_CATEGORIES[category]}
              </h3>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <FavoriteBadge key={item.id} favorite={item} />
                ))}
              </div>
            </div>
          )
        );
      })}
    </div>
  );
}
