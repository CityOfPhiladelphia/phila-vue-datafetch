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

## Release Notes

### 0.0.19

* In 2 places where data-manager.js didGeocode() calls `setMapZoom`, it attempts to use `this.config.map.geocodeZoom`. The default is set to 19. 

### 0.0.18 - 6/2/2019

* Uses axios 0.19.0 to fix security bug

### 0.0.17 - 5/30/2019

* Ran `yarn upgrade` to upgrade all packages
