import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {

  homePageUrl = "/home";
  aboutPageUrl = "/about";
  angularPageUrl = "/angular";
  springPageUrl = "/spring";
  contactPageUrl = "/contact";

  homeSelected: Boolean = true; 
  aboutSelected: Boolean = false;
  angularSelected: Boolean = false;
  springSelected: Boolean = false;
  contactSelected: Boolean = false;

  constructor(
    private readonly router: Router
  ) { }

  goToHome() {
    this.homeSelected = true; 
    this.aboutSelected = false;
    this.angularSelected = false;
    this.springSelected = false;
    this.contactSelected = false;
    this.router.navigateByUrl(this.homePageUrl);
  }

  goToAbout() {
    this.homeSelected = false; 
    this.aboutSelected = true;
    this.angularSelected = false;
    this.springSelected = false;
    this.contactSelected = false;
    this.router.navigateByUrl(this.aboutPageUrl);
  }

  goToAngular() {
    this.homeSelected = false; 
    this.aboutSelected = false;
    this.angularSelected = true;
    this.springSelected = false;
    this.contactSelected = false;
    this.router.navigateByUrl(this.angularPageUrl);
  }

  goToSpring() {
    this.homeSelected = false; 
    this.aboutSelected = false;
    this.angularSelected = false;
    this.springSelected = true;
    this.contactSelected = false;
    this.router.navigateByUrl(this.springPageUrl);
  }

  goToContact() {
    this.homeSelected = false; 
    this.aboutSelected = false;
    this.angularSelected = false;
    this.springSelected = false;
    this.contactSelected = true;
    this.router.navigateByUrl(this.contactPageUrl);
  }

  ngOnInit(): void {
  }

}
