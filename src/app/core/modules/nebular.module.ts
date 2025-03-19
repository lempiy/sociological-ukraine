import { NgModule } from '@angular/core';
import {
    NbThemeModule,
    NbLayoutModule,
    NbButtonModule,
    NbAlertModule,
    NbIconModule,
    NbInputModule,
    NbRadioModule,
    NbSelectModule,
    NbSpinnerModule,
    NbCardModule,
    NbCheckboxModule,
    NbDialogModule,
    NbToastrModule
} from '@nebular/theme';
import { NbEvaIconsModule } from '@nebular/eva-icons';

@NgModule({
    imports: [
        NbThemeModule.forRoot({ name: 'default' }),
        NbLayoutModule,
        NbEvaIconsModule,
        NbButtonModule,
        NbAlertModule,
        NbIconModule,
        NbInputModule,
        NbRadioModule,
        NbSelectModule,
        NbSpinnerModule,
        NbCardModule,
        NbCheckboxModule,
        NbDialogModule.forRoot(),
        NbToastrModule.forRoot()
    ],
    exports: [
        NbThemeModule,
        NbLayoutModule,
        NbEvaIconsModule,
        NbButtonModule,
        NbAlertModule,
        NbIconModule,
        NbInputModule,
        NbRadioModule,
        NbSelectModule,
        NbSpinnerModule,
        NbCardModule,
        NbCheckboxModule,
        NbDialogModule,
        NbToastrModule
    ]
})
export class NebularModule { }
