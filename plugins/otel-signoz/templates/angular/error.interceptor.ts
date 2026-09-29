// otel-signoz plugin template — functional interceptor (Angular 15+).
// If the project ALREADY has an error interceptor, don't register this one too: fold this logic into the
// existing one instead.
import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorNotificationService } from './error-notification.service';

/**
 * For calls that handle their own error locally (avoids a duplicate notification):
 *   this.http.get(url, { context: new HttpContext().set(SKIP_GLOBAL_ERROR_UI, true) })
 * and, in that local handling, call `this.errors.fromHttpError(err)` to keep the Trace ID.
 */
export const SKIP_GLOBAL_ERROR_UI = new HttpContextToken<boolean>(() => false);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errors = inject(ErrorNotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      // 401 follows whatever session/login flow the project already has.
      if (error instanceof HttpErrorResponse && error.status !== 401 && !req.context.get(SKIP_GLOBAL_ERROR_UI)) {
        errors.fromHttpError(error);
      }
      return throwError(() => error);
    }),
  );
};
