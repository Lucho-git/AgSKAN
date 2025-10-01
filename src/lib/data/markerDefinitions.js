// Single source of truth for all markers
export const MARKER_DEFINITIONS = [
  { id: "default", class: "default", name: "Default Marker", active: true },
  
  // Custom SVG markers - ACTIVE (high usage)
  { id: "rock", class: "custom-svg", name: "Rock", active: true },
  { id: "tree13", class: "custom-svg", name: "Tree", active: true },
  { id: "watertank2", class: "custom-svg", name: "Water Tank", active: true },
  { id: "wheat2", class: "custom-svg", name: "Wheat", active: true },
  { id: "kangaroo", class: "custom-svg", name: "Kangaroo", active: true },
  { id: "electric_tower", class: "custom-svg", name: "Power Tower", active: true },
  { id: "gate", class: "custom-svg", name: "Gate", active: true },
  { id: "machine_pump", class: "custom-svg", name: "Pump", active: true },
  { id: "recharge_icon", class: "custom-svg", name: "Charging", active: true },
  { id: "repair_shop", class: "custom-svg", name: "Repair Shop", active: true },
  { id: "tractor", class: "custom-svg", name: "Tractor", active: true },
  { id: "silo2", class: "custom-svg", name: "Silo", active: true },
  { id: "tree_stump", class: "custom-svg", name: "Tree Stump", active: true },
  { id: "workshop_icon", class: "custom-svg", name: "Workshop", active: true },
  
  // Ionic markers - ACTIVE (high/medium usage)
  { id: "pin", class: "ionic-pin", name: "Pin", active: true },
  { id: "arrow-up-circle", class: "ionic-arrow-up-circle", name: "Arrow Up", active: true },
  { id: "arrow-down-circle", class: "ionic-arrow-down-circle", name: "Arrow Down", active: true },
  { id: "arrow-back-circle", class: "ionic-arrow-back-circle", name: "Arrow Back", active: true },
  { id: "arrow-forward-circle", class: "ionic-arrow-forward-circle", name: "Arrow Forward", active: true },
  { id: "thumbs-down", class: "ionic-thumbs-down", name: "Thumbs Down", active: true },
  { id: "thumbs-up", class: "ionic-thumbs-up", name: "Thumbs Up", active: true },
  { id: "people", class: "ionic-people", name: "People", active: true },
  { id: "home", class: "ionic-home", name: "Home", active: true },
  { id: "checkmark-circle", class: "ionic-checkmark-circle", name: "Success", active: true },
  { id: "close-circle", class: "ionic-close-circle", name: "Error", active: true },
  { id: "information-circle", class: "ionic-information-circle", name: "Info", active: true },
  { id: "warning", class: "ionic-warning", name: "Warning", active: true },
  { id: "help-circle", class: "ionic-help-circle", name: "Help", active: true },
  { id: "ban", class: "ionic-ban", name: "Ban", active: true },
  { id: "trail-sign", class: "ionic-trail-sign", name: "Trail", active: true },
  { id: "beer", class: "ionic-beer", name: "Beer", active: true },
  { id: "paw", class: "ionic-paw", name: "Animal", active: true },
  { id: "skull", class: "ionic-skull", name: "Danger", active: true },
  { id: "fish", class: "ionic-fish", name: "Fish", active: true },
  { id: "bonfire", class: "ionic-bonfire", name: "Fire", active: true },
  { id: "construct", class: "ionic-construct", name: "Construction", active: true },
  { id: "leaf", class: "ionic-leaf", name: "Leaf", active: true },
  { id: "rainy", class: "ionic-rainy", name: "Rain", active: true },
  { id: "cloud", class: "ionic-cloud", name: "Cloud", active: true },
  { id: "water", class: "ionic-water", name: "Water", active: true },
  
  // Atlas markers - ACTIVE (high/medium usage)
  { id: "car-garage", class: "at-car-garage", name: "Garage", active: true },
  { id: "exit", class: "at-exit", name: "Exit", active: true },
  { id: "gasoline", class: "at-gasoline", name: "Fuel", active: true },
  { id: "carrot", class: "at-carrot", name: "Carrot", active: true },
  { id: "middle-finger", class: "at-middle-finger", name: "Rude", active: true },
  { id: "wheat-harvest", class: "at-wheat-harvest", name: "Harvest", active: true },
  { id: "houses", class: "at-houses", name: "Houses", active: true },
  { id: "berries", class: "at-berries", name: "Berries", active: true },
  { id: "rain-drops", class: "at-rain-drops", name: "Rain Drops", active: true },
  { id: "home", class: "at-home", name: "Home", active: true },
  { id: "farming-tractor", class: "at-farming-tractor", name: "Tractor", active: true },
  { id: "house-home", class: "at-house-home", name: "House", active: true },
  { id: "xmark-circle", class: "at-xmark-circle", name: "Cancel", active: true },
  { id: "kg-weight", class: "at-kg-weight", name: "Weight", active: true },
  { id: "green-gas", class: "at-green-gas", name: "Gas", active: true },
  { id: "construction-transport", class: "at-construction-transport", name: "Transport", active: true },
  { id: "crane-truck", class: "at-crane-truck", name: "Crane", active: true },
  { id: "bulldozer", class: "at-bulldozer", name: "Bulldozer", active: true },
  
  // DEPRECATED markers (never used - backward compatible only)
  { id: "toilet-bathroom", class: "at-toilet-bathroom", name: "Toilet", active: false, deprecated: true },
  { id: "electricity-home", class: "at-electricity-home", name: "Power", active: false, deprecated: true },
  { id: "helicopter-travel", class: "at-helicopter-travel", name: "Helicopter", active: false, deprecated: true },
  { id: "camper-vehicle", class: "at-camper-vehicle", name: "Camper", active: false, deprecated: true },
  { id: "cargo-transport", class: "at-cargo-transport", name: "Cargo", active: false, deprecated: true },
  { id: "delivery-truck", class: "at-delivery-truck", name: "Delivery", active: false, deprecated: true },
  { id: "liquid-transportation", class: "at-liquid-transportation", name: "Liquid", active: false, deprecated: true },
  { id: "lock-open", class: "ionic-lock-open", name: "Unlocked", active: false, deprecated: true },
  { id: "call", class: "ionic-call", name: "Phone", active: false, deprecated: true },
  { id: "radio", class: "ionic-radio", name: "Radio", active: false, deprecated: true },
  { id: "cloud-offline", class: "ionic-cloud-offline", name: "Offline", active: false, deprecated: true },
  { id: "battery-charging", class: "ionic-battery-charging", name: "Charging", active: false, deprecated: true },
  { id: "thermometer", class: "ionic-thermometer", name: "Temperature", active: false, deprecated: true },
  { id: "sunny", class: "ionic-sunny", name: "Sunny", active: false, deprecated: true },
  { id: "thunderstorm", class: "ionic-thunderstorm", name: "Storm", active: false, deprecated: true },
  { id: "restaurant", class: "ionic-restaurant", name: "Restaurant", active: false, deprecated: true },
  { id: "car", class: "ionic-car", name: "Car", active: false, deprecated: true },
  { id: "bicycle", class: "ionic-bicycle", name: "Bicycle", active: false, deprecated: true },
  { id: "camera", class: "ionic-camera", name: "Camera", active: false, deprecated: true },
  { id: "flame", class: "ionic-flame", name: "Flame", active: false, deprecated: true },
  { id: "footsteps", class: "ionic-footsteps", name: "Footsteps", active: false, deprecated: true },
  { id: "key", class: "ionic-key", name: "Key", active: false, deprecated: true },
  { id: "man", class: "ionic-man", name: "Person", active: false, deprecated: true },
  { id: "bus", class: "ionic-bus", name: "Bus", active: false, deprecated: true },
  { id: "subway", class: "ionic-subway", name: "Subway", active: false, deprecated: true },
  { id: "electric-car", class: "at-electric-car", name: "Electric Car", active: false, deprecated: true },
  { id: "accessibility", class: "ionic-accessibility", name: "Accessibility", active: false, deprecated: true },
  { id: "settings", class: "ionic-settings", name: "Settings", active: false, deprecated: true },
  { id: "location", class: "ionic-location", name: "Location", active: false, deprecated: true },
  { id: "lock-closed", class: "ionic-lock-closed", name: "Locked", active: false, deprecated: true },
  { id: "trash", class: "ionic-trash", name: "Trash", active: false, deprecated: true },
  { id: "cart", class: "ionic-cart", name: "Cart", active: false, deprecated: true },
  { id: "locate", class: "ionic-locate", name: "GPS", active: false, deprecated: true },
  { id: "wifi", class: "ionic-wifi", name: "WiFi", active: false, deprecated: true },
  { id: "fast-food", class: "ionic-fast-food", name: "Food", active: false, deprecated: true },
  { id: "airplane", class: "ionic-airplane", name: "Airplane", active: false, deprecated: true },
  { id: "boat", class: "ionic-boat", name: "Boat", active: false, deprecated: true },
  { id: "bed", class: "ionic-bed", name: "Bed", active: false, deprecated: true },
  { id: "build", class: "ionic-build", name: "Build", active: false, deprecated: true },
  { id: "desktop", class: "ionic-desktop", name: "Computer", active: false, deprecated: true },
  { id: "earth", class: "ionic-earth", name: "Earth", active: false, deprecated: true },
  { id: "telescope", class: "ionic-telescope", name: "Telescope", active: false, deprecated: true },
  { id: "construction-truck", class: "at-construction-truck", name: "Construction", active: false, deprecated: true },
  { id: "carrot-turnip-vegetable", class: "at-carrot-turnip-vegetable", name: "Vegetables", active: false, deprecated: true },
  { id: "transport-truck", class: "at-transport-truck", name: "Truck", active: false, deprecated: true },
  { id: "ladder-truck", class: "at-ladder-truck", name: "Ladder Truck", active: false, deprecated: true },
]

// Helper functions
export function getActiveMarkers() {
  return MARKER_DEFINITIONS.filter(m => m.active)
}

export function getAllMarkers() {
  return MARKER_DEFINITIONS
}

export function findMarkerByIconClass(iconClass) {
  if (!iconClass || iconClass === "default") {
    return MARKER_DEFINITIONS.find(m => m.id === "default")
  }
  
  if (iconClass.startsWith("custom-svg-")) {
    const id = iconClass.replace("custom-svg-", "")
    return MARKER_DEFINITIONS.find(m => m.class === "custom-svg" && m.id === id)
  }
  
  return MARKER_DEFINITIONS.find(m => m.class === iconClass)
}

export function getIconImageName(iconClass) {
  if (!iconClass || iconClass === "default") return "default"
  
  if (iconClass.startsWith("custom-svg-") || 
      iconClass.startsWith("ionic-") || 
      iconClass.startsWith("at-")) {
    return iconClass
  }
  
  return "default"
}