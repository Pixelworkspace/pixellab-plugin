// Panel action names as named constants (CamelCase). Same `const … as const`
// idiom as WidgetType. Using these in BOTH the widgets (action: Action.Generate)
// and the router (case Action.Generate) means the two can never drift apart —
// no magic strings. Compiled into the bundle; Action.Generate resolves to
// 'generate' at runtime.

export const Action = {
  // navigation
  Tab: 'tab',
  JobDetail: 'jobDetail',
  JobBack: 'jobBack',
  GotoSettings: 'gotoSettings',
  // settings persistence
  Desc: 'desc',
  RepaintDesc: 'repaintDesc',
  Size: 'size',
  NoBg: 'nobg',
  ApiKey: 'apiKey',
  BaseUrl: 'baseUrl',
  AnimAction: 'animAction',
  FrameCount: 'frameCount',
  InputSource: 'inputSource',
  InputFrame: 'inputFrame',
  InputGroup: 'inputGroup',
  LastFrame: 'lastFrame',
  Enhance: 'enhance',
  Seed: 'seed',
  // commands
  Generate: 'generate',
  Insert: 'insert',
  SaveAsset: 'saveAsset',
  Repaint: 'repaint',
  Animate: 'animate',
  Balance: 'balance',
  // jobs
  JobInsert: 'jobInsert',
  JobAsset: 'jobAsset',
  JobResume: 'jobResume',
  JobDelete: 'jobDelete',
} as const;

/** Union of the action string values. */
export type ActionValue = (typeof Action)[keyof typeof Action];
