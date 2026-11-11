<script lang="ts">
  /** App Store + Google Play download links. */
  const IOS_URL = "https://apps.apple.com/us/app/agskan/id6746783538"
  const ANDROID_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"
</script>

<div class="badges">
  <a href={IOS_URL} target="_blank" rel="noopener noreferrer" class="store">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
      />
    </svg>
    <span>
      <small>Download on the</small>
      <strong>App Store</strong>
    </span>
  </a>
  <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer" class="store">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"
      />
    </svg>
    <span>
      <small>Get it on</small>
      <strong>Google Play</strong>
    </span>
  </a>
</div>

<style>
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .store {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 3.25rem;
    padding: 0.45rem 1.1rem 0.45rem 0.9rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 999px;
    color: var(--lp-ink);
    transition:
      border-color 0.2s ease,
      transform 0.2s ease;
  }
  .store:hover {
    border-color: var(--lp-ink);
    transform: translateY(-2px);
  }
  svg {
    width: 1.35rem;
    height: 1.35rem;
    flex-shrink: 0;
  }
  span {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  small {
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--lp-ink-faint);
  }
  strong {
    font-size: 0.95rem;
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    .store {
      transition: none;
    }
  }
</style>
