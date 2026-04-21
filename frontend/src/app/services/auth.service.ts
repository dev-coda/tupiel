import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { getApiBaseUrl } from '../util/api-base-url';

interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  name: string;
  /** Inteligencia de Pacientes role from app DB */
  ipRol?: 'admin' | 'operario';
  ipCargo?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'tupiel_token';
  private readonly USER_KEY = 'tupiel_user';

  private _user = signal<UserInfo | null>(null);
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());

  private base(): string {
    return getApiBaseUrl();
  }

  constructor(private http: HttpClient, private router: Router) {
    // Restore user from localStorage on init
    const savedUser = localStorage.getItem(this.USER_KEY);
    if (savedUser && this.getToken()) {
      try {
        this._user.set(JSON.parse(savedUser));
      } catch {
        this.clearSession();
      }
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.base()}/auth/login`, { username, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.TOKEN_KEY, res.token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
          this._user.set(res.user);
        })
      );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Verify the current token is still valid by calling /api/auth/me.
   * Returns true if valid, false otherwise.
   */
  verifyToken(): Observable<boolean> {
    const token = this.getToken();
    if (!token) return of(false);

    return this.http
      .get<{ user: UserInfo }>(`${this.base()}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(
        tap((res) => {
          this._user.set(res.user);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        }),
        map(() => true),
        catchError(() => {
          this.clearSession();
          return of(false);
        })
      );
  }

  private clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._user.set(null);
  }
}
