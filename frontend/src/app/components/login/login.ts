import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    CardModule,
    MessageModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  username = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private auth: AuthService, private router: Router) {
    // If already logged in, redirect
    if (auth.isLoggedIn()) {
      this.router.navigate(['/ppto']);
    }
  }

  onSubmit(): void {
    if (!this.username || !this.password) {
      this.error.set('Ingrese usuario y contraseña');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.router.navigate(['/ppto']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.error || 'Error al iniciar sesión. Intente de nuevo.'
        );
      },
    });
  }
}
