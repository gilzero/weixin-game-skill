// @file: snippet-globals.d.ts
// @desc: typed application contracts for documentation
// These declarations model omitted application code; wx and its instance types come from the installed package.
declare function beginTouch(id: number, x: number, y: number): void;
declare function moveTouch(id: number, x: number, y: number): void;
declare function endTouch(id: number): void;
declare function cancelTouch(id: number): void;
declare function handleRightClick(x: number, y: number): void;
declare function zoomCamera(deltaY: number, x: number, y: number): void;
declare const music: WechatMinigame.InnerAudioContext;
declare let interrupted: boolean;
declare let wantsMusic: boolean;
declare let muted: boolean;
declare function createScreen(): {
  content: { left: number; bottom: number };
  onResize(listener: (layout: { content: { left: number; bottom: number } }) => void): () => void;
};
declare function saveSubscriptionChoice(id: string, accepted: boolean): void;
declare function showRankSubscriptionState(state: unknown): void;
declare function sendCodeToYourServer(code: string): void;
declare function showPrivacyDialog(actions: {
  onShown(): void;
  onAgree(): void;
  onDisagree(): void;
  onOpenPolicy(): void;
}): void;
declare function startFeatureThatUsesPersonalData(): void;
declare function continueWithoutPersonalData(): void;
declare function startStage(): void;
declare function showRetry(error: unknown): void;
declare function hideProgress(): void;
declare function drawProgress(progress: number): void;
declare function grantReward(): void;
declare function showAdUnavailableMessage(error: unknown): void;
declare function refreshBalanceFromServer(): void;
declare function handlePaymentFailure(error: unknown): void;
declare function handleDesignTouch(x: number, y: number): void;
declare function update(delta: number, elapsed: number): void;
declare function draw(): void;
declare const imageCache: Map<string, unknown>;
declare function applyPhysics(bodies: unknown): void;
declare function getPhysicsBodies(): unknown[];
declare function stepPhysics(bodies: unknown): unknown[];
declare const worker: WechatMinigame.Worker;
declare const boardWidth: number;
declare const boardHeight: number;
declare const boardX: number;
declare const boardY: number;
declare const pixelRatio: number;
declare function handleServerMessage(data: string | ArrayBuffer): void;
declare function scheduleReconnect(closeCode: number): void;
