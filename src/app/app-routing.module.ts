import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Routing } from './constants/route-constants';
import { LandingPageComponent } from './landing-page/landing-page.component';

const routes: Routes = [
  {
    path: '', redirectTo: Routing.home, pathMatch: 'full'
  },
  {
    path: Routing.home, component: LandingPageComponent
  },
  {
    path: Routing.about, component: LandingPageComponent
  },
  {
    path: Routing.angular, component: LandingPageComponent
  },
  {
    path: Routing.spring, component: LandingPageComponent
  },
  {
    path: Routing.contact, component: LandingPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
