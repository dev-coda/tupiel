import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IpIntelApiService, IpAppUser } from '../../../services/ip-intel-api.service';
import { AuthService } from '../../../services/auth.service';
import { IpStateService } from '../ip-state.service';
import { mapAuthUserToIpUser } from '../ip-auth-map';

@Component({
  selector: 'app-ip-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ip-usuarios.html',
  styleUrl: './ip-usuarios.scss',
})
export class IpUsuarios implements OnInit {
  private readonly api = inject(IpIntelApiService);
  readonly auth = inject(AuthService);
  private readonly st = inject(IpStateService);

  users = signal<IpAppUser[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  modalOpen = signal(false);
  editing = signal<IpAppUser | null>(null);
  formUsername = '';
  formName = '';
  formPassword = '';
  formRol: 'admin' | 'operario' = 'operario';
  formCargo = '';
  saving = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listInteligenciaAppUsers().subscribe({
      next: (r) => {
        this.users.set(r.users ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'No se pudo cargar la lista');
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.formUsername = '';
    this.formName = '';
    this.formPassword = '';
    this.formRol = 'operario';
    this.formCargo = '';
    this.modalOpen.set(true);
  }

  openEdit(u: IpAppUser): void {
    this.editing.set(u);
    this.formUsername = u.username;
    this.formName = u.name;
    this.formPassword = '';
    this.formRol = u.ipRol;
    this.formCargo = u.ipCargo ?? '';
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  save(): void {
    const name = this.formName.trim();
    const cargo = this.formCargo.trim();
    if (!name) {
      this.error.set('El nombre es obligatorio');
      return;
    }

    const ed = this.editing();
    this.saving.set(true);
    this.error.set(null);

    if (!ed) {
      const u = this.formUsername.trim();
      const pwd = this.formPassword;
      if (!u) {
        this.error.set('El usuario es obligatorio');
        this.saving.set(false);
        return;
      }
      if (pwd.length < 6) {
        this.error.set('La contraseña debe tener al menos 6 caracteres');
        this.saving.set(false);
        return;
      }
      this.api
        .createInteligenciaAppUser({
          username: u,
          name,
          password: pwd,
          ipRol: this.formRol,
          ipCargo: cargo || undefined,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.modalOpen.set(false);
            this.reload();
          },
          error: (e) => {
            this.error.set(e?.error?.error ?? 'No se pudo crear');
            this.saving.set(false);
          },
        });
      return;
    }

    const pwd = this.formPassword.trim();
    const patch: {
      name: string;
      ipRol: 'admin' | 'operario';
      ipCargo: string;
      password?: string;
    } = {
      name,
      ipRol: this.formRol,
      ipCargo: cargo,
    };
    if (pwd.length > 0) {
      patch.password = pwd;
    }

    this.api.patchInteligenciaAppUser(ed.id, patch).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.reload();
        if (ed.id === this.auth.user()?.id) {
          this.auth.verifyToken().subscribe({
            next: () => {
              const u = this.auth.user();
              if (u) this.st.login(mapAuthUserToIpUser(u));
            },
          });
        }
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'No se pudo guardar');
        this.saving.set(false);
      },
    });
  }

  deleteUser(u: IpAppUser): void {
    if (u.id === this.auth.user()?.id) return;
    const ok = window.confirm(
      `¿Eliminar al usuario "${u.username}"? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    this.error.set(null);
    this.api.deleteInteligenciaAppUser(u.id).subscribe({
      next: () => this.reload(),
      error: (e) => this.error.set(e?.error?.error ?? 'No se pudo eliminar'),
    });
  }
}
