import { PHOTOSHOP_REMOTE_TYPE } from "./photoshop-protocol.js";

/** Runtime-neutral preference descriptors shared by WebView declaration and UXP validation. */
export const PHOTOSHOP_PREFERENCE_ROOT_PROPERTIES = {
  general: PHOTOSHOP_REMOTE_TYPE.PreferencesGeneral,
  interface: PHOTOSHOP_REMOTE_TYPE.PreferencesInterface,
  tools: PHOTOSHOP_REMOTE_TYPE.PreferencesTools,
  history: PHOTOSHOP_REMOTE_TYPE.PreferencesHistory,
  fileHandling: PHOTOSHOP_REMOTE_TYPE.PreferencesFileHandling,
  performance: PHOTOSHOP_REMOTE_TYPE.PreferencesPerformance,
  cursors: PHOTOSHOP_REMOTE_TYPE.PreferencesCursors,
  transparencyAndGamut: PHOTOSHOP_REMOTE_TYPE.PreferencesTransparencyAndGamut,
  unitsAndRulers: PHOTOSHOP_REMOTE_TYPE.PreferencesUnitsAndRulers,
  guidesGridsAndSlices: PHOTOSHOP_REMOTE_TYPE.PreferencesGuidesGridsAndSlices,
  type: PHOTOSHOP_REMOTE_TYPE.PreferencesType,
  notifications: PHOTOSHOP_REMOTE_TYPE.PreferencesNotifications
} as const;

export const PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES = {
  [PHOTOSHOP_REMOTE_TYPE.PreferencesCursors]: ["paintingCursors", "otherCursors"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesFileHandling]: ["imagePreviews", "useLowerCaseExtension", "askBeforeSavingLayeredTIFF", "maximizeCompatibility", "recentFileListMaximum"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesGeneral]: ["colorPicker", "imageInterpolation", "exportClipboard", "autoUpdateOpenDocuments", "beepWhenDone"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesGuidesGridsAndSlices]: ["guideStyle", "gridStyle", "gridSubDivisions", "showSliceNumber"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesHistory]: ["createFirstSnapshot", "nonLinearHistory", "numberOfHistoryStates", "useHistoryLog", "editLogItems", "saveLogItems"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesInterface]: ["dynamicColorSliders", "textFontSize", "colorChannelsInColor"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesNotifications]: ["quietMode", "showFeatureOnboarding", "showToolTips", "showWhatsNew", "useRichToolTips"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesPerformance]: ["imageCacheLevels", "maxRAMuse"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesTools]: ["showToolTips", "useShiftKeyForToolSwitch", "keyboardZoomResizesWindows"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesTransparencyAndGamut]: ["gridSize", "gamutWarningOpacity"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesType]: ["showTextFeatures", "showEnglishFontNames", "smartQuotes"],
  [PHOTOSHOP_REMOTE_TYPE.PreferencesUnitsAndRulers]: ["rulerUnits", "typeUnits", "pointSize"]
} as const;

export type PhotoshopPreferenceCategoryType = keyof typeof PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES;

export function isPhotoshopPreferenceType(type: string): boolean {
  return type === PHOTOSHOP_REMOTE_TYPE.Preferences || type in PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES;
}
