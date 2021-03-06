# phila-vue-datafetch ([@phila/vue-datafetch](https://www.npmjs.com/package/@phila/vue-datafetch) in [npmjs.com](https://npmjs.com))

phila-vue-datafetch is a library of functions used for fetching data for an app which uses [Vue.js](https://vuejs.org/v2/guide/) and [Vuex](https://vuex.vuejs.org/).  The functions included are designed to geocode addresses, and fetch data from any REST APIs input, and to return the data in a structured way into the Vuex store, so that data can be efficiently used in an app.

![](https://s3.amazonaws.com/mapboard-images/phila-vue-datafetch/phila-vue-datafetch.JPG)

## To Include The Library In Your App
* in a bundled app, use npm:

    `npm install @phila/vue-datafetch`

* in an html file, use the CDN:

    `<script src="//unpkg.com/@phila/vue-datafetch@1.1.7/dist/phila-vue-datafetch.js"></script>`


## Usage
Check out [the wiki](https://github.com/CityOfPhiladelphia/phila-vue-datafetch/wiki) for usage documentation.

## Publishing

To publish a new version of @phila/vue-datafetch to NPM:

1. Commit your changes to `master`.
2. Bump the NPM version with `npm version major|minor|patch`. (Double check this is done from 'master')
3. Push with tags: `git push && git push --tags`.
4. Update wiki docs to reflect new version and/or dependency changes.


## Release Notes

### 1.4.8 - 10/29/2020

* updates to routing

### 1.4.7 - 10/29/2020

* updates to routing

### 1.4.6 - 10/28/2020

* update to routing for public path of real estate tax

### 1.4.5 - 10/27/2020

* uses github actions to push to npmjs

### 1.4.4 - 10/21/2020

* includes changes for running -board frameworks off vue-router

### 1.4.3 - 10/6/2020

* ran yarn upgrades

### 1.4.2 - 9/16/2020

* fixes issue with esri search in layerboard

### 1.4.1 - 9/15/2020

* allows real estate tax to use input in tips if geocode fails

### 1.4.0 - 8/28/2020

* removes all imports of leaflet and esri-leaflet

### 1.3.1 - 7/29/2020

* small fixes for routing in atlas, datafetching in layerboard

### 1.3.0 - 7/17/2020

* adds block search client

### 1.2.2 - 6/14/2020

* adds airtable as a possible source

### 1.2.1 - 5/27/2020

* upgrades all packages

### 1.2.0 - 5/5/2020

* merges changes for use in pinboard and viewerboard

### 1.1.8 - 3/2/2020

### 1.1.7 - 1/31/2020

* pushes to @phila/vue-datafetch instead of @philly/vue-datafetch

### 1.1.6 - 1/24/2020

### 1.1.4, 1.1.5 - 1/24/2020

* Changes to fix routing changes using broswer nav to load and zoom with shape searches.

### 1.1.3 - 1/24/2020

* builds for push to npm

### 1.1.2 - 1/24/2020

* Adds message when retrieving condos takes multiple API calls

### 1.1.1 - 1/22/2020

* Fixes release mistake

### 1.1.0 - 1/22/2020

* Fixes bug with different numbers of condos found in PDE when using different search methods

### 1.0.3 - 1/17/2020

* Fixes bug with routing that breaks handleMapClick in Atlas

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
