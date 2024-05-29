import axios from 'axios';
import BaseClient from './base-client';
import qs from 'qs';

class AgoTokenClient extends BaseClient {

  fetch() {
    console.log('AgoTokenClient fetch is running');
    let data = qs.stringify({
      'f': 'json',
      'username': process.env.VUE_APP_AGO_USERNAME,
      'password': process.env.VUE_APP_AGO_PASSWORD,
      'referer': 'https://www.mydomain.com' 
    });
  
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://www.arcgis.com/sharing/rest/generateToken',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        // 'Authorization': 'Basic Og=='
      },
      data : data
    };
  
    axios.request(config)
    .then((response) => {
      console.log(JSON.stringify(response.data));
      this.dataManager.didFetchData('agoToken', 'success', response.data);
      // this.$store.commit('setAgoToken', response.data.token);
    })
    .catch((error) => {
      console.log(error);
    });
  }
}

export default AgoTokenClient;