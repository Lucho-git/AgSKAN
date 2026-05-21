import * as turf from "@turf/turf"

function cloneGeometry(geometry) {
  if (!geometry?.type || !geometry?.coordinates) return null
  try {
    return JSON.parse(JSON.stringify(geometry))
  } catch (error) {
    return null
  }
}

function geometryKey(feature) {
  try {
    return `${feature?.geometry?.type}:${JSON.stringify(feature?.geometry?.coordinates)}`
  } catch (error) {
    return null
  }
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function toTurfFeature(feature) {
  const geometry = cloneGeometry(feature?.geometry)
  if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) return null
  return turf.feature(geometry, feature?.properties || {})
}

function dedupeFeatures(features) {
  const seen = new Set()
  return (features || []).filter((feature) => {
    const key = geometryKey(feature)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function postProgress(requestId, progress, stage) {
  self.postMessage({
    requestId,
    type: "progress",
    progress,
    stage,
  })
}

function featuresOverlap(featureA, featureB) {
  if (!featureA?.geometry || !featureB?.geometry) return false
  if (geometryKey(featureA) === geometryKey(featureB)) return true

  try {
    const bboxA = turf.bbox(featureA)
    const bboxB = turf.bbox(featureB)
    if (
      bboxA[2] < bboxB[0] ||
      bboxB[2] < bboxA[0] ||
      bboxA[3] < bboxB[1] ||
      bboxB[3] < bboxA[1]
    ) {
      return false
    }

    if (
      turf.booleanOverlap(featureA, featureB) ||
      turf.booleanContains(featureA, featureB) ||
      turf.booleanContains(featureB, featureA)
    ) {
      return true
    }
  } catch (error) {
    // Try intersection as a final exact check.
  }

  try {
    const intersection = turf.intersect(turf.featureCollection([featureA, featureB]))
    return intersection ? turf.area(intersection) > 1 : false
  } catch (error) {
    return false
  }
}

function buildOverlappingGroup(seed, candidates, requestId) {
  const seedKey = geometryKey(seed)
  let group = [seed]
  let remaining = candidates.filter((feature) => geometryKey(feature) !== seedKey)
  let changed = true
  let checkedCount = 0
  const estimatedChecks = Math.max(1, remaining.length * 2)

  while (changed) {
    changed = false
    const nextRemaining = []

    remaining.forEach((candidate) => {
      checkedCount += 1
      if (checkedCount % 3 === 0) {
        postProgress(
          requestId,
          0.16 + Math.min(0.48, (checkedCount / estimatedChecks) * 0.48),
          "grouping",
        )
      }
      const overlapsGroup = group.some((groupFeature) =>
        featuresOverlap(groupFeature, candidate),
      )
      if (overlapsGroup) {
        group.push(candidate)
        changed = true
      } else {
        nextRemaining.push(candidate)
      }
    })

    remaining = nextRemaining
  }

  postProgress(requestId, 0.64, "grouped")

  return group
}

function unionFeatures(features) {
  if (!features.length) return null
  if (features.length === 1) return features[0]

  try {
    return turf.union(turf.featureCollection(features))
  } catch (error) {
    try {
      return features.slice(1).reduce((result, feature) => {
        return turf.union(turf.featureCollection([result, feature])) || result
      }, features[0])
    } catch (fallbackError) {
      return null
    }
  }
}

self.onmessage = (event) => {
  const { requestId, seedFeature, candidates, year = 2025 } = event.data || {}

  try {
    postProgress(requestId, 0.06, "normalizing")
    const seed = toTurfFeature(seedFeature)
    const turfCandidates = dedupeFeatures([seedFeature, ...(candidates || [])])
      .map(toTurfFeature)
      .filter(Boolean)

    if (!seed) {
      self.postMessage({ requestId, ok: false })
      return
    }

    postProgress(requestId, 0.12, "detecting-overlap")
    const group = buildOverlappingGroup(seed, turfCandidates, requestId)
    postProgress(requestId, 0.7, "unioning")
    const unioned = unionFeatures(group)
    postProgress(requestId, 0.9, "measuring")
    const selectedFeature = unioned || seed
    const rawCollection = turf.featureCollection(group)
    const rawAreaHa = Math.round((turf.area(rawCollection) / 10000) * 100) / 100
    const resolvedAreaHa = Math.round((turf.area(selectedFeature) / 10000) * 100) / 100
    const groupSelectionKey = `pmtiles-premerge-${year}-${hashString(
      group.map(geometryKey).filter(Boolean).sort().join("|"),
    )}`

    self.postMessage({
      requestId,
      ok: true,
      feature: {
        type: "Feature",
        geometry: selectedFeature.geometry,
        properties: {
          ...(seedFeature?.properties || {}),
          ftw_id: groupSelectionKey,
          selection_key: groupSelectionKey,
          resolving_boundary: false,
          boundary_resolved: true,
          premerged_from_visible_count: group.length,
          premerged_raw_area_ha: rawAreaHa,
          premerged_area_ha: resolvedAreaHa,
          premerged_overlap_removed_ha: Math.max(0, rawAreaHa - resolvedAreaHa),
          premerged_selection_mode: "overlapping_visible_geometries",
          premerged_exact_union: !!unioned,
          premerged_deferred_union: false,
          premerged_area_pending: false,
        },
      },
      features: group,
    })
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error?.message || String(error),
    })
  }
}
