import { RULES } from '../config/rules';
import type { GpsFix } from '../types';

/**
 * A gate returns the first reason an action may not run. The pattern is borrowed from the reference
 * blueprint's ActionGate, but the rules here follow the EcoTrace PRD (30 m GPS, 5-10 s walking video).
 */
export type GateState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'waiting'; readonly reason: string }
  | { readonly kind: 'blocked'; readonly reason: string; readonly action?: 'signIn' };

export interface GateFacts {
  readonly busy?: boolean;
  readonly online?: boolean;
  readonly signedIn?: boolean;
  readonly restoringSession?: boolean;
  readonly cameraState?: 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';
  readonly recorderSupported?: boolean;
  readonly fix?: GpsFix | null;
  readonly chosen?: boolean;
  readonly missingBin?: boolean;
}

type Rule = (facts: GateFacts) => GateState | null;

const ready: GateState = { kind: 'ready' };
const waiting = (reason: string): GateState => ({ kind: 'waiting', reason });
const blocked = (reason: string, action?: 'signIn'): GateState => ({ kind: 'blocked', reason, action });

const busy: Rule = (facts) => (facts.busy ? waiting('Working…') : null);
const offline: Rule = (facts) => (facts.online === false ? blocked('You are offline.') : null);
const signIn: Rule = (facts) => {
  if (facts.signedIn !== false) return null;
  return facts.restoringSession ? waiting('Checking your session…') : blocked('Sign in to submit a report.', 'signIn');
};
const waitForCamera: Rule = (facts) => {
  if (facts.cameraState === 'denied') return blocked('Camera access was blocked. Allow it in your browser settings.');
  if (facts.cameraState === 'unsupported') return blocked('This browser has no rear camera stream available.');
  if (facts.cameraState === 'error') return blocked('The camera could not start. Try again.');
  if (facts.cameraState !== 'live') return waiting('Starting the camera…');
  return null;
};
const waitForGps: Rule = (facts) => {
  if (!facts.fix) return waiting('Waiting for a GPS fix…');
  if (facts.fix.accuracyM > RULES.GPS_MAX_ACCURACY_M) {
    return waiting(`GPS accuracy is ${Math.round(facts.fix.accuracyM)} m. Move outside for a fix under ${RULES.GPS_MAX_ACCURACY_M} m.`);
  }
  return null;
};
const chooseType: Rule = (facts) => (facts.chosen ? null : blocked('Pick a waste type first.'));

const evaluate = (facts: GateFacts, rules: readonly Rule[]): GateState => {
  for (const rule of rules) {
    const state = rule(facts);
    if (state) return state;
  }
  return ready;
};

/** Single snapshot: camera live, accurate GPS, signed in. */
export const shutterGate = (facts: GateFacts): GateState =>
  evaluate(facts, [busy, waitForCamera, waitForGps, offline, signIn]);

/** Walking-mode video: same gates plus MediaRecorder support. */
export const recordGate = (facts: GateFacts): GateState =>
  evaluate(facts, [
    busy,
    (facts) => (facts.recorderSupported ? null : blocked('This browser cannot record video.')),
    waitForCamera,
    waitForGps,
    offline,
    signIn,
  ]);

/** Final submit: everything above plus an explicit waste type. */
export const submitGate = (facts: GateFacts): GateState =>
  evaluate(facts, [busy, chooseType, waitForGps, offline, signIn]);

/** A "missing bin" marker needs no photo, but still needs an accurate fix. */
export const missingBinGate = (facts: GateFacts): GateState =>
  evaluate(facts, [busy, waitForGps, offline, signIn]);

export const isReady = (state: GateState): boolean => state.kind === 'ready';

export const gateMessage = (state: GateState): string => (state.kind === 'ready' ? '' : state.reason);
