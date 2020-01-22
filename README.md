# phila-vue-datafetch ([@philly/vue-datafetch](https://www.npmjs.com/package/@philly/vue-datafetch) in [npmjs.com](https://npmjs.com))

phila-vue-datafetch is a library of functions used for fetching data for an app which uses [Vue.js](https://vuejs.org/v2/guide/) and [Vuex](https://vuex.vuejs.org/).  The functions included are designed to geocode addresses, and fetch data from any REST APIs input, and to return the data in a structured way into the Vuex store, so that data can be efficiently used in an app.

![](https://s3.amazonaws.com/mapboard-images/phila-vue-datafetch/phila-vue-datafetch.JPG)

## To Include The Library In Your App
* in a bundled app, use npm:

    `npm install @philly/vue-datafetch`

* in an html file, use the CDN:

    `<script src="//unpkg.com/@philly/vue-datafetch@0.0.14/dist/phila-vue-datafetch.js"></script>`


## Usage
Check out [the wiki](https://github.com/CityOfPhiladelphia/phila-vue-datafetch/wiki) for usage documentation.

## Publishing

To publish a new version of Mapboard to NPM:

1. Commit your changes to `master`.
2. Bump the NPM version with `npm version major|minor|patch`.
3. Push with tags: `git push && git push --tags`.
4. Update wiki docs to reflect new version and/or dependency changes.


## Release Notes

### 1.1.0 - 1/22/2020

* Fixes bug with different numbers of condos found in PDE when using different search methods

### 1.0.2 - 1/15/2020

* Fix: Clearing shape in edge cases
* Fix: Regression from previous fix to routing was causing condo button not to work on reverse geocode searches.

### 0.0.30 - 11/12/2019

* pushes change to fix http-get further

### 0.0.30 - 11/12/2019

* pushes change to fix http-get

### 0.0.29 - 10/23/2019

* fixes bug with date-fns due to upgrade

### 0.0.28 - 10/22/2019

* upgrades from dependabot

### 0.0.27 - 10/8/2019

* small bug fixes, including working with keywords from a ComboSearch and handling topics when there are no parcels layers in state

### 0.0.26 - 10/7/2019

* Monthly package upgrades, merges in changes made for restructuring

### 0.0.25 - 9/20/2019

* Changes for working with polyline in pvm

### 0.0.24 - 9/6/2019

* Monthly package upgrades

### 0.0.23 - 8/29/2019

* Changes for allowing esri-sources in Pinboard

### 0.0.22 - 8/9/2019

* Monthly package upgrades

### 0.0.21 - 7/12/2019

* Bugfix for routing in Pinboard

### 0.0.20 - 7/11/2019

* Monthly package upgrades

### 0.0.19 - 6/20/2019

* In 2 places where data-manager.js didGeocode() calls `setMapZoom`, it attempts to use `this.config.map.geocodeZoom`. The default is set to 19.

### 0.0.18 - 6/2/2019

* Uses axios 0.19.0 to fix security bug

### 0.0.17 - 5/30/2019

* Ran `yarn upgrade` to upgrade all packages
