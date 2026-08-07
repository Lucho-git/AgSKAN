<!-- src/lib/components/map/toolbox/WeatherControls.svelte -->
<script context="module">
  // Cache the last successful weather panel payload so reopening the menu
  // renders instantly (no "Loading weather…" / no UI jumping around).
  let panelCache = null
</script>

<script>
  // @ts-nocheck — plain-JS component; typed helpers live in $lib/utils/weather.ts
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { MapPin, Loader2, Wind, Droplets, CloudRain, Umbrella, Thermometer, Radio } from "lucide-svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import {
    fetchForecast,
    fetchOpenMeteoCurrent,
    forecastDays,
    wmoDesc,
    forecastIcon,
    WX_DROPLET,
    windDir,
    deltaT,
    loadFieldsAndFarms,
    resolveWeatherSource,
    fetchBomFwoReading,
    loadNearbyStations,
    stationToCurrent,
    formatReadingTime,
    formatAgeH,
    STALE_STATION_HOURS,
    tryStationReading,
    weatherHeroKey,
  } from "$lib/utils/weather"

  let fields = []
  let farms = []
  let fieldsLoading = true

  let locating = false
  let errorMsg = ""
  let stationList = []
  let stationsLoading = false
  let stationOpen = false

  // Hydrate from the cached panel payload (when it matches the current
  // source) so reopening the weather menu renders instantly.
  const panelKey = weatherHeroKey($userSettingsStore.weatherSource ?? null)
  const cachedPanel =
    panelCache && panelCache.key === panelKey ? panelCache : null

  let loading = !cachedPanel
  let notice = cachedPanel?.notice ?? ""
  let current = cachedPanel?.current ?? null
  let forecastDaysList = cachedPanel?.forecastDaysList ?? []
  let activeLabel = cachedPanel?.activeLabel ?? "Farm centre"

  $: weatherSource = $userSettingsStore.weatherSource || null
  $: sourceMode = weatherSource?.mode || "farm"
  $: sourceFarmId = weatherSource?.farmId || ""
  $: sourceStation = weatherSource?.station || null

  function dayLabel(dateStr) {
    if (!dateStr) return ""
    // Build local-midnight dates from the YYYY-MM-DD part so the day
    // difference is an exact whole number (avoids the noon 0.5-day rounding
    // bug that mislabelled Today as Tomorrow and Tomorrow as a weekday).
    const [y, m, dd] = dateStr.slice(0, 10).split("-").map(Number)
    const d = new Date(y, m - 1, dd)
    const now = new Date()
    const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diff = Math.round((d - ref) / 86400000)
    if (diff === 0) return "Today"
    if (diff === 1) return "Tomorrow"
    return d.toLocaleDateString("en-AU", { weekday: "short" })
  }

  async function fetchWeather() {
    loading = true
    errorMsg = ""
    notice = ""
    const resolved = await resolveWeatherSource(
      $userSettingsStore.weatherSource,
      fields,
      farms,
    )
    if (!resolved) {
      toast.error("No field boundaries to get weather for")
      loading = false
      return
    }
    activeLabel = resolved.label
    const src = $userSettingsStore.weatherSource
    try {
      const errs = []
      const fc = await fetchForecast(resolved.coords).catch((e) => {
        errs.push(e?.message || String(e))
        return null
      })
      let cur = null
      if (src?.mode === "station" && src.station) {
        // Station mode: current conditions from the BoM station; rain chance
        // from Open-Meteo at the station's coordinates.
        try {
          const { reading, ageH } = await fetchBomFwoReading(src.station)
          const om = await fetchOpenMeteoCurrent(resolved.coords).catch(() => null)
          cur = {
            current: stationToCurrent(src.station, reading, ageH),
            daily: om?.daily || {},
          }
          if (ageH != null && ageH > STALE_STATION_HOURS) {
            // The station has a reading but isn't reporting live — show that
            // last reading and when it was taken.
            activeLabel = `${src.station.name} · last reading`
            notice = `${src.station.name} isn't reporting live — showing its last reading from ${formatReadingTime(reading.local_date_time_full)} (${formatAgeH(ageH)}).`
          }
        } catch (e) {
          // No reading on record — don't present this station as usable.
          // Bounce the saved source back to the farm centre and reload.
          toast.error(
            `${src.station.name} has no live reading — switched to Farm centre.`,
          )
          await userSettingsApi.updateWeatherSource({
            mode: "farm",
            farmId: "",
            lat: null,
            lng: null,
          })
          await fetchWeather()
          return
        }
      } else {
        cur = await fetchOpenMeteoCurrent(resolved.coords).catch((e) => {
          errs.push(e?.message || String(e))
          return null
        })
      }
      current = cur
      const fcDays = fc ? forecastDays(fc) : []
      // ECMWF (models=ecmwf_ifs025) starts its daily series at TOMORROW —
      // prepend a Today card built from the current-conditions call (the
      // default model includes today in its daily block).
      if (cur) {
        const d0 = cur.daily || {}
        const todayCard = {
          date: d0.time?.[0] || new Date().toISOString().slice(0, 10),
          max: d0.temperature_2m_max?.[0],
          min: d0.temperature_2m_min?.[0],
          code: d0.weather_code?.[0] ?? cur.current?.weather_code,
          rain: d0.precipitation_sum?.[0] ?? cur.current?.precipitation ?? 0,
          prob: d0.precipitation_probability_max?.[0],
          wind: null,
          gust: null,
          windDir: null,
          sunrise: null,
          sunset: null,
        }
        if (!fcDays.length || fcDays[0].date !== todayCard.date) {
          fcDays.unshift(todayCard)
        }
      }
      forecastDaysList = fcDays
      if (errs.length) errorMsg = errs.join(" · ")
      // Cache the successful payload so reopening the menu is instant.
      panelCache = {
        key: weatherHeroKey($userSettingsStore.weatherSource ?? null),
        current,
        forecastDaysList,
        activeLabel,
        notice,
      }
    } finally {
      loading = false
    }
  }

  // Save a new weather source, then reload for it
  async function setSource(next) {
    const res = await userSettingsApi.updateWeatherSource(next)
    if (res && !res.success) {
      toast.error(res.message || "Could not save weather source")
    }
    await fetchWeather()
  }

  async function setWholeFarm() {
    await setSource({ mode: "farm", farmId: "", lat: null, lng: null })
  }

  async function pickFarm(id) {
    await setSource({ mode: "farm", farmId: id, lat: null, lng: null })
  }

  // Native select handler. "Farm centre" uses value "__fc__" so it differs
  // from the hidden placeholder value ("") used while on My location / a
  // station — meaning re-selecting Farm centre always fires a change event.
  function onFarmChange(e) {
    const v = e.currentTarget.value
    if (v === "__fc__") setWholeFarm()
    else if (v) pickFarm(v)
  }

  async function referenceCoords() {
    const resolved = await resolveWeatherSource(
      $userSettingsStore.weatherSource,
      fields,
      farms,
    )
    return resolved?.coords || null
  }

  async function openStationPicker() {
    // Toggle: clicking the station button again closes the list.
    if (stationOpen) {
      stationOpen = false
      return
    }
    const ref = await referenceCoords()
    if (!ref) {
      toast.error("Choose a farm or location first to find nearby stations")
      return
    }
    stationOpen = true
    stationsLoading = true
    try {
      stationList = await loadNearbyStations(ref, 12)
    } catch (e) {
      toast.error("Could not load nearby stations: " + (e?.message || e))
    } finally {
      stationsLoading = false
    }
  }

  async function pickStation(st) {
    // Safety: confirm this station actually has a reading before saving it.
    const ok = await tryStationReading({
      wmo: st.wmo,
      name: st.name,
      lat: st.lat,
      lon: st.lon,
      state: st.state,
    })
    if (!ok) {
      toast.error(`${st.name} has no live reading — pick a different station`)
      return
    }
    await setSource({
      mode: "station",
      station: {
        wmo: st.wmo,
        name: st.name,
        lat: st.lat,
        lon: st.lon,
        state: st.state,
      },
    })
    // Close the station list after picking one; reopen with the button.
    stationOpen = false
  }

  async function useMyLocation() {
    locating = true
    try {
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not available")
      }
      const pos = await Promise.race([
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 0,
          })
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timed out")), 12000),
        ),
      ])
      await setSource({
        mode: "my",
        farmId: "",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })
    } catch (e) {
      toast.error(
        "Could not get your location — check browser permissions" +
          (e?.message ? ` (${e.message})` : ""),
      )
    } finally {
      locating = false
    }
  }

  onMount(async () => {
    const mapId = $profileStore?.master_map_id
    if (mapId) {
      try {
        const r = await loadFieldsAndFarms(mapId)
        fields = r.fields
        farms = r.farms
      } catch (e) {
        toast.error(`Failed to load fields: ${e.message}`)
      } finally {
        fieldsLoading = false
      }
    }
    await fetchWeather()
  })
</script>

<div class="wx">
  <!-- Hero -->
  {#if loading && !current}
    <div class="state">
      <span class="spin"><Loader2 size={14} /></span>
      <span>Loading weather…</span>
    </div>
  {:else if current?.current}
    {@const c = current.current}
    {@const dt = deltaT(c.temperature_2m, c.dew_point_2m)}
    {@const windy = c.wind_speed_10m != null && c.wind_speed_10m >= 15}
    {@const rainChance =
      current.daily?.precipitation_probability_max?.[0] != null
        ? Math.round(current.daily.precipitation_probability_max[0])
        : null}
    {@const todayRain =
      current.daily?.precipitation_sum?.[0] != null
        ? Number(current.daily.precipitation_sum[0])
        : c.precipitation != null
          ? Number(c.precipitation)
          : null}
    {@const rainy =
      (c.precipitation != null && c.precipitation > 0) ||
      (todayRain != null && todayRain >= 1)}
    {@const dtGood = !isNaN(dt) && dt >= 2 && dt <= 8}
    {@const dtWarn = !isNaN(dt) && (dt < 2 || dt > 8)}
    <div class="hero">
      <div class="hero-main">
        <div class="hero-icon">{@html forecastIcon(c.weather_code)}</div>
        <div class="hero-text">
          <div class="hero-temp"
            >{c.temperature_2m != null ? Math.round(c.temperature_2m) : "-"}°</div
          >
          <div class="hero-cond">{wmoDesc(c.weather_code ?? 3)}</div>
          <div class="hero-loc">{activeLabel}</div>
        </div>
      </div>

      <div class="hero-metrics">
        <div class="metric" class:windy>
          <span class="m-ico"><Wind size={15} /></span>
          <span class="m-val"
            >{c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : "-"}{c.wind_direction_10m != null ? " " + windDir(c.wind_direction_10m) : ""}</span
          >
          <span class="m-lab">wind</span>
        </div>
        <div class="metric">
          <span class="m-ico"><Droplets size={15} /></span>
          <span class="m-val"
            >{c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) + "%" : "-"}</span
          >
          <span class="m-lab">humidity</span>
        </div>
        <div class="metric m-rain" class:rainy={rainy}>
          <span class="m-icos">
            <span class="m-ico"><CloudRain size={15} /></span>
            <span class="m-ico"><Umbrella size={15} /></span>
          </span>
          <span class="m-val"
            >{todayRain != null ? todayRain.toFixed(1) + "mm" : "-"}{rainChance != null ? " · " + rainChance + "%" : ""}</span
          >
          <span class="m-lab">rain · chance</span>
        </div>
        <div
          class="metric"
          class:dt-good={dtGood}
          class:dt-warn={dtWarn}
          title={isNaN(dt)
            ? "Delta T"
            : dtWarn
              ? "Delta T " + dt.toFixed(1) + "° — outside the ideal 2–8° spray window"
              : "Delta T " + dt.toFixed(1) + "° — in the ideal 2–8° spray window"}
        >
          <span class="m-ico"><Thermometer size={15} /></span>
          <span class="m-val">{isNaN(dt) ? "-" : dt.toFixed(1)}°</span>
          <span class="m-lab">ΔT</span>
        </div>
      </div>
    </div>
  {:else if errorMsg}
    <p class="err">{errorMsg}</p>
  {/if}

  {#if notice}
    <div class="wx-notice">{notice}</div>
  {/if}

  <!-- 7-day strip -->
  {#if forecastDaysList.length}
    <div class="days">
      {#each forecastDaysList as d (d.date)}
        <div class="day">
          <span class="day-name">{dayLabel(d.date)}</span>
          <div class="day-icon">{@html forecastIcon(d.code)}</div>
          <span class="day-temp"
            >{d.max != null ? Math.round(d.max) : "-"}°<span class="day-min"
              >{d.min != null ? Math.round(d.min) : "-"}°</span
            ></span
          >
          <span class="day-rain">{@html WX_DROPLET}{d.rain != null ? Number(d.rain).toFixed(1) + "mm" : "-"} · {d.prob != null ? d.prob + "%" : "-"}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Weather source (bottom) -->
  <div class="source-box">
    <span class="src-title">Weather source</span>
    <p class="src-desc">
      Where should the weather be for? Your choice is saved and used on the
      toolbox weather card too.
    </p>

    <div class="loc-row">
      <select
        class="farm-select"
        class:active={sourceMode === "farm"}
        value={sourceMode === "farm" ? sourceFarmId || "__fc__" : ""}
        on:change={onFarmChange}
        disabled={loading}
        aria-label="Weather farm centre"
      >
        {#if sourceMode !== "farm"}
          <option value="" disabled hidden>Farm centre</option>
        {/if}
        <option value="__fc__">Farm centre</option>
        {#each farms as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
      <button
        class:active={sourceMode === "my"}
        on:click={useMyLocation}
        disabled={loading || locating}
      >
        {#if locating}
          <span class="spin"><Loader2 size={14} /></span>
        {:else}
          <MapPin size={14} />
        {/if}
        <span>My location</span>
      </button>
    </div>

    <button
      class="station-toggle"
      class:active={sourceMode === "station"}
      on:click={openStationPicker}
      disabled={loading || stationsLoading}
    >
      {#if stationsLoading}
        <span class="spin"><Loader2 size={14} /></span>
      {:else}
        <Radio size={14} />
      {/if}
      <span>{sourceStation ? `Station: ${sourceStation.name}` : "Use a weather station"}</span>
    </button>

    {#if stationOpen}
      {#if stationsLoading}
        <div class="station-empty">Finding live stations…</div>
      {:else if stationList.length}
        <div class="station-list">
          {#each stationList as st (st.wmo)}
            <button
              class="station-row"
              class:active={sourceStation?.wmo === st.wmo}
              on:click={() => pickStation(st)}
              disabled={loading}
            >
              <span class="st-name">{st.name}</span>
              <span class="st-dist">{st.distKm.toFixed(0)} km</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="station-empty">
          No live weather stations found near this location.
        </div>
      {/if}
    {/if}

    <div class="foot">
      <span class="src-badge">Open-Meteo · ECMWF</span>
    </div>
  </div>
</div>

<style>
  .wx {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: rgba(255, 255, 255, 0.85);
  }

  /* ── Hero ── */
  .hero {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 12px 12px;
    border-radius: 14px;
    background: linear-gradient(
      160deg,
      rgba(56, 189, 248, 0.16),
      rgba(56, 189, 248, 0.03)
    );
    border: 1px solid rgba(56, 189, 248, 0.24);
  }
  .hero-main {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .hero-icon {
    line-height: 0;
    flex-shrink: 0;
  }
  .hero-icon :global(svg) {
    width: 56px;
    height: 56px;
  }
  .hero-text {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .hero-temp {
    font-size: 40px;
    font-weight: 800;
    color: #fff;
    line-height: 1;
  }
  .hero-cond {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.75);
  }
  .hero-loc {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 2px;
  }

  .hero-metrics {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    width: 100%;
  }
  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 7px 2px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 0;
  }
  .m-ico {
    display: flex;
    color: rgba(255, 255, 255, 0.7);
  }
  .m-val {
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
  }
  .m-lab {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.4);
  }
  /* Animated wind when it's windy */
  .metric.windy .m-ico {
    color: #7dd3fc;
    animation: wx-wind 1.1s ease-in-out infinite;
  }
  @keyframes wx-wind {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(2.5px);
    }
  }

  /* Rain + chance: double width, but same vertical card pattern as the
     other metrics (icons / one value line / label) so it stays aligned. */
  .metric.m-rain {
    grid-column: span 2;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .m-icos {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .m-rain .m-lab {
    text-align: center;
  }
  /* Animated rain: blue highlight + a staggered drip bounce when it's wet */
  .metric.m-rain.rainy .m-ico {
    color: #38bdf8;
  }
  .metric.m-rain.rainy .m-ico:first-child {
    animation: wx-rain 1.4s ease-in-out infinite;
  }
  .metric.m-rain.rainy .m-ico:last-child {
    animation: wx-rain 1.4s ease-in-out infinite 0.35s;
  }
  @keyframes wx-rain {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(2.5px);
    }
  }
  /* Delta T: green when in the ideal 2–8° spray window, red pulsing when out */
  .metric.dt-good .m-ico {
    color: #34d399;
  }
  .metric.dt-warn .m-ico {
    color: #f87171;
    animation: wx-dt 1.2s ease-in-out infinite;
  }
  @keyframes wx-dt {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.18);
    }
  }

  /* ── 7-day strip ── */
  .days {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .day {
    min-width: 52px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .day-name {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.5);
  }
  .day-icon {
    height: 30px;
    display: flex;
    align-items: center;
    line-height: 0;
  }
  .day-icon :global(svg) {
    width: 30px;
    height: 30px;
  }
  .day-temp {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }
  .day-min {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
    margin-left: 2px;
  }
  .day-rain {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.55);
  }

  /* ── Weather source (bottom) ── */
  .source-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .src-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.45);
  }
  .src-desc {
    font-size: 11px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .loc-row {
    display: flex;
    gap: 8px;
  }
  .loc-row button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .loc-row button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .loc-row button.active {
    background: rgba(56, 189, 248, 0.18);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
  }
  .loc-row button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .farm-select {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 12px;
  }
  .farm-select.active {
    background: rgba(56, 189, 248, 0.18);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
  }
  .farm-select option {
    background: #1e293b;
    color: #fff;
  }

  .station-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .station-toggle:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .station-toggle.active {
    background: rgba(56, 189, 248, 0.18);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
  }
  .station-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .station-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 160px;
    overflow-y: auto;
  }
  .station-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  .station-row:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  .station-row.active {
    background: rgba(56, 189, 248, 0.16);
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }
  .station-row:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .st-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st-dist {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }
  .station-empty {
    padding: 8px 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 2px;
  }
  .src-badge {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
  }

  .state {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    padding: 8px 0;
  }
  .err {
    font-size: 12px;
    color: #f87171;
    margin: 0;
  }

  .wx-notice {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.45;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.25);
  }

  .spin {
    animation: wx-spin 1s linear infinite;
  }
  @keyframes wx-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>


