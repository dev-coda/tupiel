import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  // Check if there's a token in storage (page refresh scenario)
  const token = auth.getToken();
  if (token) {
    // Token exists but user signal was reset (page refresh) — allow and let interceptor handle
    return true;
  }

  router.navigate(['/login']);
  return false;
};
