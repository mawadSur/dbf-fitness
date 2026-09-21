/**
 * Local composites for the two auth screens (stage 2 redesign).
 *
 * Nothing here invents colour, type or spacing: every piece is built from
 * `src/components/ui`. They live outside `ui/` because the shared layer is
 * frozen for this wave; the report lists them under `uiRequests` so the
 * integrator can promote the generic parts (field ref + onBlur, banner live
 * region) into `Input`/`Banner`.
 */

export { AuthAlert, type AuthAlertProps } from './AuthAlert';
export { AuthBrandHeader, AUTH_VALUE_PROP, type AuthBrandHeaderProps } from './AuthBrandHeader';
export { AuthField, type AuthFieldProps } from './AuthField';
export { AuthSwitchLink, type AuthSwitchLinkProps } from './AuthSwitchLink';
