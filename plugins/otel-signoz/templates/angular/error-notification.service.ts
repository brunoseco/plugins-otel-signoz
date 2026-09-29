// otel-signoz plugin template — REFERENCE implementation using SweetAlert2.
// This is a starting point, not a mandate: the setup skill detects whichever notification library the
// target project already uses (ngx-toastr, Angular Material, PrimeNG, a custom component...) and adapts
// this service to render through that library instead — see references/angular-frontend.md. Use this
// file verbatim only when the project has no notification library yet.
// A system failure needs a DIALOG (it must offer a copy button); a domain error only needs a toast.
import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import { ErrorDetails, toErrorDetails } from './trace-id.util';
import { environment } from '../../environments/environment';

interface SupportConfig {
  /** Support/admin email (mailto with a pre-filled subject and body). */
  email?: string;
  /** URL to open a support ticket (service desk, Jira SM, etc.). */
  ticketUrl?: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: string) => value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

@Injectable({ providedIn: 'root' })
export class ErrorNotificationService {
  private readonly support: SupportConfig = (environment as { support?: SupportConfig }).support ?? {};
  private readonly observability = (environment as {
    observability?: { serviceName?: string; environment?: string; serviceVersion?: string };
  }).observability;

  fromHttpError(error: HttpErrorResponse): void {
    this.show(toErrorDetails(error));
  }

  show(details: ErrorDetails): void {
    if (!details.isSystemFailure) {
      void Swal.fire({ icon: 'warning', text: details.message });
      return;
    }

    const copyText = this.buildCopyText(details);
    void Swal.fire({
      icon: 'error',
      title: 'An error occurred',
      html: this.buildHtml(details, copyText),
      confirmButtonText: 'Copy details',
      showCancelButton: true,
      cancelButtonText: 'Close',
      // Copies without closing the dialog (the user may still want to click the support link).
      preConfirm: async () => {
        const ok = await this.copy(copyText);
        const button = Swal.getConfirmButton();
        if (button) button.textContent = ok ? 'Copied ✓' : 'Copy the code manually';
        return false;
      },
    });
  }

  private buildHtml(d: ErrorDetails, copyText: string): string {
    const code = d.traceId
      ? `<p style="margin:1rem 0 .25rem;font-size:.85rem;color:#757575">Error code (Trace ID)</p>
         <code style="display:block;padding:.5rem;border-radius:4px;background:rgba(0,0,0,.05);user-select:all;word-break:break-all">${esc(d.traceId)}</code>`
      : `<p style="margin:1rem 0 .25rem;font-size:.85rem;color:#757575">Occurred at ${esc(new Date(d.occurredAt).toLocaleString())}</p>`;

    const reference = d.traceId ? 'this code' : 'the date and time of the error';
    const links = [
      this.support.email
        ? `<a href="${esc(this.mailto(copyText))}">Email support</a>`
        : '',
      this.support.ticketUrl
        ? `<a href="${esc(this.support.ticketUrl)}" target="_blank" rel="noopener">Open a ticket</a>`
        : '',
    ].filter(Boolean).join(' · ');

    return `<p>${esc(d.message)}</p>
      ${code}
      <p style="margin-top:1rem;font-size:.9rem">If this keeps happening, contact support or your system
      administrator with ${reference}.</p>
      ${links ? `<p style="font-size:.9rem">${links}</p>` : ''}`;
  }

  private buildCopyText(d: ErrorDetails): string {
    return [
      `System: ${this.observability?.serviceName ?? document.title}`,
      `Message: ${d.message}`,
      `Trace ID: ${d.traceId ?? 'not available'}`,
      `Date/time: ${d.occurredAt}`,
      `Screen: ${location.pathname}`,
      d.apiPath ? `API route: ${d.apiPath}` : '',
      `HTTP status: ${d.status}`,
      this.observability?.environment ? `Environment: ${this.observability.environment}` : '',
      this.observability?.serviceVersion && !/^__.+__$/.test(this.observability.serviceVersion)
        ? `Version: ${this.observability.serviceVersion}`
        : '',
    ].filter(Boolean).join('\n');
  }

  private mailto(copyText: string): string {
    const subject = encodeURIComponent(`Error in ${this.observability?.serviceName ?? ''}`.trim());
    const body = encodeURIComponent(`${copyText}\n\n(Describe what you were doing and attach a screenshot.)`);
    return `mailto:${this.support.email}?subject=${subject}&body=${body}`;
  }

  /** navigator.clipboard requires a secure context (HTTPS); fall back for plain-HTTP intranets. */
  private async copy(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the fallback */
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}
