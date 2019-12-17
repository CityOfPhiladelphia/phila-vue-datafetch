import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {

  evaluateDataForUnits(data) {
    console.log('condo-search-client evaluateDataForUnit, data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);

    for (let item in groupedData){
      units.push.apply(units, groupedData[item]);
      // groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      // dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]));

    units.length > 0 ? units = _.groupBy(units, a => a.properties.pwd_parcel_id) : "";
    this.store.commit('setUnits', units);

    return data;
  }

  setFeatureProperties(feature, totalUnits) {
    console.log('setFeatureProperties is running, feature:', feature, 'totalUnits:', totalUnits);
    console.log('this.store.state.parcels.pwd[0].properties.ADDRESS:', this.store.state.parcels.pwd[0].properties.ADDRESS);

    feature.properties.opa_owners = [ "Condominium (" + totalUnits + " Units)" ];
    feature.properties.street_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
    console.log('setFeatureProperties is still running');
    feature.properties.opa_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
    feature.properties.pwd_parcel_id = this.store.state.parcels.pwd[0].properties.PARCELID;
    feature._featureId = this.store.state.parcels.pwd[0].properties.PARCELID;
    feature.condo = true;
    console.log('setFeatureProperties is ending');

  }

  fetch(input) {
    console.log('condo-search-client fetch is running, input', input);
    const store = this.store;
    let condoConfig = JSON.parse(JSON.stringify(this.config.geocoder));
    condoConfig.url = this.config.geocoder.url;

    condoConfig.params.include_units = true;

    const url = condoConfig.url(input);
    const params = condoConfig.params;

    // update state
    // this.store.commit('setGeocodeStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    console.log('condo success is running');
    const store = this.store;
    const data = response.data;
    let features = data.features;
    const url = response.config.url;
    let params = response.config.params;
    // console.log('geocode search success', url, 'data:', data, 'params:', params, response.config.params);
    const totalUnits = data.total_size;

    if (!data.features || data.features.length < 1) {
      return;
    }

    async function getPages(features) {
      // console.log('still going 2, pages:', );

      let pages = Math.ceil(data.total_size / 100);

      if (pages > 1) {
        for (let counter = 2; counter<=pages; counter++) {
          // console.log('in loop, counter:', counter, this);
          params.page = counter;
          let pageResponse = await axios.get(url, { params });
          features = await features.concat(pageResponse.data.features);
          // console.log('response:', pageResponse, 'features:', features)
        }
      }

      let units = features.filter(a => a.properties.unit_num != "");
      units = this.evaluateDataForUnits(units);

      var feature = JSON.parse(JSON.stringify(units[0]));
      for (let i in feature.properties) {
        feature.properties[i] = "";
      }

      // if(this.store.state.parcels.pwd === null) {
      //   console.log('getPages if is running');
      //   const latLng = { lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] };
      //   const callback = () => {
      //     // console.log('callback is running');
      //
      //     this.setFeatureProperties(feature, totalUnits);
      //
      //     store.commit('setGeocodeData', feature);
      //     store.commit('setGeocodeStatus', 'success');
      //     if (this.store.state.lastSearchMethod === 'buffer search') {
      //       console.log('in callback, in buffer search mode');
      //       this.dataManager.didGeocode(feature);
      //     }
      //     if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
      //       this.store.commit('setLastSearchMethod', 'geocode');
      //       this.dataManager.fetchData();
      //     }
      //
      //     // if(feature.geometry.coordinates) {
      //     //   // console.log('if feature.geometry.coordinates is running');
      //     //   this.store.commit('setMapZoom', 18);
      //     //   this.store.commit('setMapCenter', feature.geometry.coordinates);
      //     // }
      //
      //     return feature;
      //   };
      //
      //   // if (this.store.state.lastSearchMethod === 'reverseGeocode') {
      //   console.log('getPages if is still running');
      //   return features;
      //   // this.dataManager.getParcelsByLatLng(latLng, 'pwd', 'noFetch', callback);
      //   // } else {
      //   // this.dataManager.getParcelsByLatLng(latLng, 'pwd', 'fetch', callback);
      //   // }
      //
      // } else {
      console.log('getPages else is running, feature:', feature);

      if(this.store.state.parcels.pwd === null) {
        // this.setFeatureProperties(feature, totalUnits);

        console.log('getPages else is still running 1');
        store.commit('setGeocodeData', feature);
        store.commit('setGeocodeStatus', 'success');
        console.log('getPages else is still running 2');
        if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
          this.store.commit('setLastSearchMethod', 'geocode');
        }
        console.log('feature:', feature);
      } else {
        this.setFeatureProperties(feature, totalUnits);

        console.log('getPages else is still running 1');
        store.commit('setGeocodeData', feature);
        store.commit('setGeocodeStatus', 'success');
        console.log('getPages else is still running 2');
        if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
          this.store.commit('setLastSearchMethod', 'geocode');
        }
        console.log('feature:', feature);
      }


      return feature;
      // }
    }

    getPages = getPages.bind(this);
    return getPages(features);
  }

  error(error) {
    const store = this.store;

    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default CondoSearchClient;
