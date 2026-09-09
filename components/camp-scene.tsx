export function CampScene({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "camp-scene small" : "camp-scene"}
      viewBox="0 0 1000 520"
      role="img"
      aria-label="An illustrated campsite among the green Catoctin mountains at sunset"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={small ? "sky-small" : "sky"} x2="0" y2="1">
          <stop stopColor="#edd9ad" />
          <stop offset="1" stopColor="#fbebc7" />
        </linearGradient>
        <symbol id={small ? "pine-small" : "pine"} viewBox="0 0 80 160">
          <path d="M36 110h8v50h-8z" fill="#514c32" />
          <path
            d="M40 0 15 55h14L5 100h19L0 138h80l-24-38h19L51 55h14z"
            fill="currentColor"
          />
        </symbol>
      </defs>
      <path
        fill={`url(#${small ? "sky-small" : "sky"})`}
        d="M0 0h1000v520H0z"
      />
      <circle cx="740" cy="118" r="56" fill="#d89a50" opacity=".8" />
      <path
        d="m0 235 105-92 101 53L357 77l124 121 95-70 137 90 153-97 134 90v309H0Z"
        fill="#a2aa83"
      />
      <path
        d="m0 306 171-118 165 95 131-127 183 149 177-127 173 120v222H0Z"
        fill="#708569"
      />
      <path d="M0 327q210-81 425 24t575-38v207H0Z" fill="#3f6654" />
      <path d="M0 437q222-123 499-33t501-17v133H0Z" fill="#294c3e" />
      <path d="M333 520q180-111 412-126-148 49-186 126Z" fill="#adab7d" />
      <g color="#264d3e">
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="48"
          y="119"
          width="120"
          height="285"
        />
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="-28"
          y="38"
          width="135"
          height="366"
        />
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="866"
          y="128"
          width="106"
          height="265"
        />
      </g>
      <g color="#183e32">
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="897"
          y="184"
          width="158"
          height="361"
        />
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="-29"
          y="231"
          width="128"
          height="305"
        />
        <use
          href={`#${small ? "pine-small" : "pine"}`}
          x="145"
          y="286"
          width="89"
          height="208"
        />
      </g>
      <path d="m588 409 76-116 116 119Z" fill="#d49b51" />
      <path d="m588 409 76-116 20 119Z" fill="#f3ca7b" />
      <path d="m622 410 42-92 16 93Z" fill="#334d3c" />
      <path d="m664 293 117 120 43 5-111-120Z" fill="#b17b40" />
      <path
        d="m397 450 41-10m-39 0 40 14"
        stroke="#a2855b"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M407 440c-17-19 11-26 6-45 25 20 4 22 18 29 7 11-8 23-24 16"
        fill="#df984c"
      />
      <path d="M414 442c-8-10 1-14 3-22 13 15 7 23-3 22" fill="#f9d58a" />
      <path
        d="m493 133 8-4 8 4m19-16 8-4 8 4"
        fill="none"
        stroke="#61715a"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
